// packages/props/src/manager.ts

import type {
  DefineInput,
  EmptyBehavior,
  PropDecl,
  PropsDeclMap,
  PropsDefaults,
  PropsResolveMeta,
  PropsSnapshot,
  PropsWatchCallback,
  RawWatchCallback,
  WatchInfo,
} from "./types";
import { mergeDecls } from "./merge";

function hasOwn(obj: any, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function shallowFreeze<T extends object>(o: T): Readonly<T> {
  return Object.freeze({ ...(o as any) });
}

function objectIs(a: any, b: any) {
  return Object.is(a, b);
}

function diffKeys(
  prev: Record<string, any>,
  next: Record<string, any>,
  keys: string[]
) {
  const changed: string[] = [];
  for (const k of keys) {
    if (!objectIs(prev[k], next[k])) changed.push(k);
  }
  return changed;
}

export type PropsManagerDiag = {
  level: "warning" | "error";
  message: string;
  key?: string;
};

type FallbackResult =
  | { ok: true; value: any; usedDefault: boolean; isNonEmpty: boolean }
  | { ok: false; usedDefault: boolean; isNonEmpty: false };

export class PropsManager {
  private decls: PropsDeclMap = {};
  private defaultStack: PropsDefaults[] = []; // latest-first
  private prevValid: Record<string, any> = {}; // per-key previous NON-EMPTY valid
  private raw: Readonly<Record<string, any>> = Object.freeze({});
  private resolved: PropsSnapshot = Object.freeze({});

  private watch: Array<{ keys: string[]; cb: PropsWatchCallback<any> }> = [];
  private watchAll: Array<{ cb: PropsWatchCallback<any> }> = [];
  private watchRaw: Array<{
    keys: string[];
    cb: RawWatchCallback<any>;
    devWarn?: boolean;
  }> = [];
  private watchRawAll: Array<{ cb: RawWatchCallback<any>; devWarn?: boolean }> =
    [];

  private diags: PropsManagerDiag[] = [];
  private hydrated = false;

  private hasObservers() {
    return (
      this.watch.length > 0 ||
      this.watchAll.length > 0 ||
      this.watchRaw.length > 0 ||
      this.watchRawAll.length > 0
    );
  }

  getDiagnostics(): readonly PropsManagerDiag[] {
    return this.diags;
  }

  /** setup-only */
  define(input: DefineInput) {
    const { decls, diags } = mergeDecls(this.decls, input);
    const hasError = diags.some((d) => d.level === "error");
    if (hasError) {
      const msg = diags
        .filter((d) => d.level === "error")
        .map((d) => (d.key ? `${d.key}: ${d.message}` : d.message))
        .join("; ");
      throw new Error(`[Props] define merge error: ${msg}`);
    }
    for (const d of diags) {
      if (d.level === "warning") {
        this.diags.push({ level: "warning", key: d.key, message: d.message });
      }
    }
    this.decls = decls;
  }

  /** setup-only */
  setDefaults(partial: PropsDefaults) {
    this.defaultStack.unshift({ ...partial });
  }

  /** setup-only */
  addWatch(keys: string[], cb: PropsWatchCallback) {
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error(
        `[Props] watch(keys) requires non-empty declared keys. Use watchAll() instead.`
      );
    }
    for (const k of keys) {
      if (!this.decls[k])
        throw new Error(`[Props] watch() key not declared: ${k}`);
    }
    this.watch.push({ keys: [...keys], cb });
  }

  /** setup-only */
  addWatchAll(cb: PropsWatchCallback) {
    this.watchAll.push({ cb });
  }

  /** setup-only: raw escape hatch */
  addWatchRaw(keys: string[], cb: RawWatchCallback, devWarn = true) {
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error(
        `[Props] watchRaw(keys) requires non-empty keys. Use watchRawAll() instead.`
      );
    }
    this.watchRaw.push({ keys: [...keys], cb, devWarn });
  }

  /** setup-only */
  addWatchRawAll(cb: RawWatchCallback, devWarn = true) {
    this.watchRawAll.push({ cb, devWarn });
  }

  /** runtime-only */
  get(): PropsSnapshot {
    return this.resolved;
  }

  /** runtime-only */
  getRaw(): Readonly<Record<string, any>> {
    return this.raw;
  }

  /** runtime-only */
  isProvided(key: string): boolean {
    return hasOwn(this.raw, key);
  }

  /** runtime-only */
  applyRaw(nextRawInput: Record<string, any>, run?: any) {
    const prevRaw = this.raw;
    const prevResolved = this.resolved;

    const nextRaw = shallowFreeze(nextRawInput ?? {});
    this.raw = nextRaw;

    const { snapshot: nextResolved } = this.resolve(nextRaw);
    this.resolved = nextResolved;

    // First hydration: never trigger watches.
    if (!this.hydrated) {
      this.hydrated = true;
      return;
    }

    if (!this.hasObservers()) return;

    this.fireWatchRaw(run, prevRaw, nextRaw);
    this.fireWatch(run, prevResolved, nextResolved);
  }

  /**
   * internal: resolve raw -> resolved (declared keys only)
   *
   * Key semantics:
   * - missing (not provided): always treated as "fallback" (even if empty="accept"),
   *   but empty="error" still enforces non-empty fallback.
   * - provided empty (null/undefined):
   *   - empty="accept": resolved becomes null (canonical empty)
   *   - empty="fallback": fallback chain (may end at null)
   *   - empty="error": must fallback to non-empty, else throw
   * - provided non-empty but invalid: same handling as empty="fallback"/"error" (accept does NOT apply)
   */
  private resolve(raw: Readonly<Record<string, any>>): {
    snapshot: PropsSnapshot;
    meta: PropsResolveMeta;
  } {
    const out: Record<string, any> = {};
    const providedKeys: string[] = [];
    const invalidKeys: string[] = [];
    const usedDefaultsKeys: string[] = [];

    const declKeys = Object.keys(this.decls);

    for (const k of declKeys) {
      const decl = this.decls[k]!;
      const provided = hasOwn(raw, k);
      if (provided) providedKeys.push(k);

      const eb: EmptyBehavior = decl.empty ?? "fallback";

      const rawVal = provided ? (raw as any)[k] : undefined;
      const isProvidedEmpty =
        provided && (rawVal === null || rawVal === undefined);
      const isMissing = !provided;

      // 1) Missing: treat as fallback/default (accept does NOT mean default-null)
      if (isMissing) {
        const fb = this.pickFallback(
          k,
          decl,
          eb === "error" ? "non-empty" : "any"
        );
        if (!fb.ok) {
          // only possible when mode=non-empty and nothing qualifies
          throw new Error(
            `[Props] prop "${k}" is missing and empty="error" has no non-empty fallback.`
          );
        }
        out[k] = fb.value;
        if (fb.usedDefault) usedDefaultsKeys.push(k);
        // update prevValid only when resolved is non-empty AND valid
        if (fb.isNonEmpty) this.prevValid[k] = fb.value;
        continue;
      }

      // 2) Provided but empty (null/undefined)
      if (isProvidedEmpty) {
        // mark invalid (provided but empty is invalid at raw layer)
        invalidKeys.push(k);

        if (eb === "accept") {
          // accept is ONLY for provided empty => resolved null; does NOT update prevValid
          out[k] = null;
          usedDefaultsKeys.push(k); // treat as canonical empty choice
          continue;
        }

        const fb = this.pickFallback(
          k,
          decl,
          eb === "error" ? "non-empty" : "any"
        );
        if (!fb.ok) {
          throw new Error(
            `[Props] prop "${k}" is empty (null/undefined) and empty="error" has no non-empty fallback.`
          );
        }
        out[k] = fb.value;
        if (fb.usedDefault) usedDefaultsKeys.push(k);
        if (fb.isNonEmpty) this.prevValid[k] = fb.value;
        continue;
      }

      // 3) Provided non-empty: validate
      const valid = this.validateNonEmptyValue(rawVal, decl);

      if (valid.ok) {
        out[k] = valid.value;
        // prevValid stores ONLY non-empty validated values
        this.prevValid[k] = valid.value;
        continue;
      }

      // 4) Provided non-empty but invalid: fallback / error
      invalidKeys.push(k);

      // accept does NOT apply to non-empty invalid values; treat accept as fallback here.
      const mode = eb === "error" ? "non-empty" : "any";
      const fb = this.pickFallback(k, decl, mode);
      if (!fb.ok) {
        throw new Error(
          `[Props] prop "${k}" is invalid and empty="error" has no non-empty fallback.`
        );
      }
      out[k] = fb.value;
      if (fb.usedDefault) usedDefaultsKeys.push(k);
      if (fb.isNonEmpty) this.prevValid[k] = fb.value;
    }

    return {
      snapshot: shallowFreeze(out),
      meta: { providedKeys, invalidKeys, usedDefaultsKeys },
    };
  }

  /**
   * Validate NON-EMPTY input (null/undefined should be handled before calling this).
   */
  private validateNonEmptyValue(
    v: any,
    decl: PropDecl
  ): { ok: true; value: any } | { ok: false } {
    // kind checks (minimal)
    switch (decl.kind) {
      case "boolean":
        if (typeof v !== "boolean") return { ok: false };
        break;
      case "string":
        if (typeof v !== "string") return { ok: false };
        break;
      case "number":
        if (typeof v !== "number" || Number.isNaN(v)) return { ok: false };
        break;
      case "object":
        if (typeof v !== "object") return { ok: false };
        break;
      case "any":
      default:
        break;
    }

    if (decl.enum) {
      const set = new Set(decl.enum.map(String));
      if (!set.has(String(v))) return { ok: false };
    }

    if (decl.range) {
      if (typeof v !== "number") return { ok: false };
      const min = decl.range.min ?? -Infinity;
      const max = decl.range.max ?? Infinity;
      if (v < min || v > max) return { ok: false };
    }

    if (decl.validator) {
      try {
        if (!decl.validator(v)) return { ok: false };
      } catch {
        return { ok: false };
      }
    }

    return { ok: true, value: v };
  }

  /**
   * Pick fallback value.
   *
   * mode:
   * - "any": may return null (canonical empty)
   * - "non-empty": must return a non-null/non-undefined value that also passes validation
   */
  private pickFallback(
    key: string,
    decl: PropDecl,
    mode: "any" | "non-empty"
  ): FallbackResult {
    const acceptAny = (v: any) => v !== undefined; // resolved never outputs undefined
    const acceptNonEmpty = (v: any) => v !== null && v !== undefined;

    const accept = mode === "non-empty" ? acceptNonEmpty : acceptAny;

    const tryTake = (v: any, usedDefault: boolean): FallbackResult => {
      if (!accept(v)) return { ok: false, usedDefault, isNonEmpty: false };
      if (v === null || v === undefined) {
        // only possible in mode="any"
        return { ok: true, value: null, usedDefault, isNonEmpty: false };
      }
      // non-empty must still satisfy schema/validator
      const valid = this.validateNonEmptyValue(v, decl);
      if (!valid.ok) return { ok: false, usedDefault, isNonEmpty: false };
      return { ok: true, value: valid.value, usedDefault, isNonEmpty: true };
    };

    // prevValid first (already validated & non-empty by construction)
    if (hasOwn(this.prevValid, key)) {
      const v = this.prevValid[key];
      const r = tryTake(v, false);
      if (r.ok) return r;
    }

    // override defaults stack (latest-first)
    for (const layer of this.defaultStack) {
      if (hasOwn(layer, key)) {
        const r = tryTake((layer as any)[key], true);
        if (r.ok) return r;
      }
    }

    // decl default
    if (hasOwn(decl as any, "default")) {
      const r = tryTake((decl as any).default, true);
      if (r.ok) return r;
    }

    // canonical empty
    if (mode === "any") {
      return { ok: true, value: null, usedDefault: true, isNonEmpty: false };
    }

    // mode=non-empty and nothing qualified
    return { ok: false, usedDefault: false, isNonEmpty: false };
  }

  private fireWatch(run: any, prev: PropsSnapshot, next: PropsSnapshot) {
    const prevObj = prev as any;
    const nextObj = next as any;
    const allKeys = Object.keys(this.decls);

    const changedAll = diffKeys(prevObj, nextObj, allKeys);

    for (const w of this.watchAll) {
      if (changedAll.length === 0) continue;
      const info: WatchInfo = {
        changedKeysAll: changedAll,
        changedKeysMatched: changedAll,
      };
      w.cb(run, next, prev, info);
    }

    for (const w of this.watch) {
      const matched = diffKeys(prevObj, nextObj, w.keys);
      if (matched.length === 0) continue;
      const info: WatchInfo = {
        changedKeysAll: changedAll,
        changedKeysMatched: matched,
      };
      w.cb(run, next, prev, info);
    }
  }

  private fireWatchRaw(
    run: any,
    prevRaw: Readonly<Record<string, any>>,
    nextRaw: Readonly<Record<string, any>>
  ) {
    const prevObj = prevRaw as any;
    const nextObj = nextRaw as any;

    const unionKeys = Array.from(
      new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])
    );

    const changedAll = diffKeys(prevObj, nextObj, unionKeys);

    for (const w of this.watchRawAll) {
      if (w.devWarn) {
        this.diags.push({
          level: "warning",
          message: `[Props] watchRawAll() is an escape hatch; avoid in official prototypes.`,
        });
      }
      if (changedAll.length === 0) continue;
      const info: WatchInfo = {
        changedKeysAll: changedAll,
        changedKeysMatched: changedAll,
      };
      w.cb(run, nextRaw, prevRaw, info);
    }

    for (const w of this.watchRaw) {
      if (w.devWarn) {
        this.diags.push({
          level: "warning",
          message: `[Props] watchRaw() is an escape hatch; avoid in official prototypes.`,
        });
      }
      const matched = diffKeys(prevObj, nextObj, w.keys);
      if (matched.length === 0) continue;
      const info: WatchInfo = {
        changedKeysAll: changedAll,
        changedKeysMatched: matched,
      };
      w.cb(run, nextRaw, prevRaw, info);
    }
  }

  /** lifecycle */
  dispose() {
    this.hydrated = false;

    this.watch = [];
    this.watchAll = [];
    this.watchRaw = [];
    this.watchRawAll = [];
    this.defaultStack = [];
    this.prevValid = {};
    this.raw = Object.freeze({});
    this.resolved = Object.freeze({});
  }
}
