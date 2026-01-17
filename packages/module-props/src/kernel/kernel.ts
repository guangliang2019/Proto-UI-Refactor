// packages/module-props/src/kernel/kernel.ts
import type {
  EmptyBehavior,
  PropSpec,
  PropsSpecMap,
  PropsBaseType,
} from "@proto-ui/types";
import { mergeSpecs } from "./merge";
import {
  PropsDefaults,
  PropsSnapshot,
  PropsWatchCallback,
  RawWatchCallback,
  WatchInfo,
} from "@proto-ui/core";
import { PropsResolveMeta } from "./types";

const hasOwn = (obj: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(obj, key);

function shallowFreeze<T extends object>(o: T): Readonly<T> {
  return Object.freeze({ ...(o as any) });
}

function objectIs(a: any, b: any) {
  return Object.is(a, b);
}

function diffKeys<P extends PropsBaseType>(
  prev: P & PropsBaseType,
  next: P & PropsBaseType,
  keys: string[]
) {
  const changed: string[] = [];
  for (const k of keys) {
    if (!objectIs(prev[k], next[k])) changed.push(k);
  }
  return changed;
}

export type PropsKernelDiag = {
  level: "warning" | "error";
  message: string;
  key?: string;
};

type FallbackResult =
  | { ok: true; value: any; usedDefault: boolean; isNonEmpty: boolean }
  | { ok: false; usedDefault: boolean; isNonEmpty: false };

export class PropsKernel<P extends PropsBaseType> {
  private specs: PropsSpecMap<P> = {} as PropsSpecMap<P>;
  private defaultStack: PropsDefaults<P>[] = []; // latest-first
  private prevValid: Partial<Record<keyof P, any>> = {}; // per-key previous NON-EMPTY valid
  private raw: Readonly<P & PropsBaseType> = Object.freeze(
    {} as Readonly<P & PropsBaseType>
  );
  private resolved: PropsSnapshot<P> = Object.freeze({} as PropsSnapshot<P>);

  private watch: Array<{ keys: string[]; cb: PropsWatchCallback<P> }> = [];
  private watchAll: Array<{ cb: PropsWatchCallback<P> }> = [];
  private watchRaw: Array<{
    keys: string[];
    cb: RawWatchCallback<P>;
    devWarn?: boolean;
  }> = [];
  private watchRawAll: Array<{ cb: RawWatchCallback<P>; devWarn?: boolean }> =
    [];

  private diags: PropsKernelDiag[] = [];
  private hydrated = false;

  private hasObservers() {
    return (
      this.watch.length > 0 ||
      this.watchAll.length > 0 ||
      this.watchRaw.length > 0 ||
      this.watchRawAll.length > 0
    );
  }

  getDiagnostics(): readonly PropsKernelDiag[] {
    return this.diags;
  }

  /** setup-only */
  define(input: PropsSpecMap<P>) {
    const { specs, diags } = mergeSpecs(this.specs, input);
    const hasError = diags.some((d: PropsKernelDiag) => d.level === "error");
    if (hasError) {
      const msg = diags
        .filter((d: PropsKernelDiag) => d.level === "error")
        .map((d: PropsKernelDiag) =>
          d.key ? `${d.key}: ${d.message}` : d.message
        )
        .join("; ");
      throw new Error(`[Props] define merge error: ${msg}`);
    }
    for (const d of diags) {
      if (d.level === "warning") {
        this.diags.push({ level: "warning", key: d.key, message: d.message });
      }
    }
    this.specs = specs;
  }

  /** setup-only */
  setDefaults(partial: PropsDefaults<P>) {
    this.defaultStack.unshift({ ...partial });
  }

  /** setup-only */
  addWatch(keys: (keyof P & string)[], cb: PropsWatchCallback<P>) {
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error(
        `[Props] watch(keys) requires non-empty declared keys. Use watchAll() instead.`
      );
    }
    for (const k of keys) {
      if (!this.specs[k])
        throw new Error(`[Props] watch() key not declared: ${k}`);
    }
    this.watch.push({ keys: [...keys], cb });
  }

  /** setup-only */
  addWatchAll(cb: PropsWatchCallback<P>) {
    this.watchAll.push({ cb });
  }

  /** setup-only: raw escape hatch */
  addWatchRaw(keys: string[], cb: RawWatchCallback<P>, devWarn = true) {
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error(
        `[Props] watchRaw(keys) requires non-empty keys. Use watchRawAll() instead.`
      );
    }
    this.watchRaw.push({ keys: [...keys], cb, devWarn });
  }

  /** setup-only */
  addWatchRawAll(cb: RawWatchCallback<P>, devWarn = true) {
    this.watchRawAll.push({ cb, devWarn });
  }

  /** runtime-only */
  get(): PropsSnapshot<P> {
    return this.resolved;
  }

  /** runtime-only */
  getRaw(): Readonly<P & PropsBaseType> {
    return this.raw as Readonly<P & PropsBaseType>;
  }

  /** runtime-only */
  isProvided(key: keyof P): boolean {
    return hasOwn(this.raw, key);
  }

  /** runtime-only */
  applyRaw(nextRawInput: Record<string, any>, run?: any): PropsResolveMeta<P> {
    const prevRaw = this.raw;
    const prevResolved = this.resolved;

    const nextRaw = shallowFreeze(nextRawInput ?? {}) as Readonly<
      P & PropsBaseType
    >;
    this.raw = nextRaw;

    const { snapshot: nextResolved, meta } = this.resolve(nextRaw);
    this.resolved = nextResolved;

    // First hydration: never trigger watches.
    if (!this.hydrated) {
      this.hydrated = true;
      return meta;
    }

    if (!this.hasObservers()) return meta;

    this.fireWatchRaw(run, prevRaw, nextRaw);
    this.fireWatch(run, prevResolved, nextResolved);

    return meta;
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
    snapshot: PropsSnapshot<P>;
    meta: PropsResolveMeta<P>;
  } {
    const out: Record<string, any> = {};

    const providedKeys: string[] = [];
    const emptyKeys: string[] = [];
    const invalidKeys: string[] = [];
    const usedFallbackKeys: string[] = [];
    const acceptedEmptyKeys: string[] = [];

    const declKeys = Object.keys(this.specs);

    for (const k of declKeys) {
      const decl = this.specs[k]!;
      const provided = Object.prototype.hasOwnProperty.call(raw, k);

      if (provided) providedKeys.push(k);

      const eb: EmptyBehavior = decl.empty ?? "fallback";
      const rawVal = provided ? (raw as any)[k] : undefined;

      const isProvidedEmpty =
        provided && (rawVal === null || rawVal === undefined);
      const isMissing = !provided;

      // 1) Missing => fallback chain (accept does NOT apply)
      if (isMissing) {
        const fb = this.pickFallback(
          k,
          decl,
          eb === "error" ? "non-empty" : "any"
        );
        if (!fb.ok) {
          throw new Error(
            `[Props] prop "${k}" is missing and empty="error" has no non-empty fallback.`
          );
        }
        out[k] = fb.value;
        if (fb.usedDefault) usedFallbackKeys.push(k);
        if (fb.isNonEmpty) (this.prevValid as any)[k] = fb.value;
        continue;
      }

      // 2) Provided but empty
      if (isProvidedEmpty) {
        emptyKeys.push(k);

        if (eb === "accept") {
          // ACCEPTED empty is not invalid.
          out[k] = null;
          acceptedEmptyKeys.push(k);
          // do NOT update prevValid
          // do NOT mark usedFallbackKeys (it was a deliberate accepted input)
          continue;
        }

        // fallback / error for empty provided
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
        if (fb.usedDefault) usedFallbackKeys.push(k);
        if (fb.isNonEmpty) (this.prevValid as any)[k] = fb.value;
        continue;
      }

      // 3) Provided non-empty => validate
      const valid = this.validateNonEmptyValue(rawVal, decl);

      if (valid.ok) {
        out[k] = valid.value;
        (this.prevValid as any)[k] = valid.value;
        continue;
      }

      // 4) Provided non-empty but invalid => invalidKeys + fallback/error
      invalidKeys.push(k);

      const mode = eb === "error" ? "non-empty" : "any";
      const fb = this.pickFallback(k, decl, mode);
      if (!fb.ok) {
        throw new Error(
          `[Props] prop "${k}" is invalid and empty="error" has no non-empty fallback.`
        );
      }
      out[k] = fb.value;
      if (fb.usedDefault) usedFallbackKeys.push(k);
      if (fb.isNonEmpty) (this.prevValid as any)[k] = fb.value;
    }

    return {
      snapshot: shallowFreeze(out) as PropsSnapshot<P>,
      meta: {
        providedKeys: providedKeys as any,
        emptyKeys: emptyKeys as any,
        invalidKeys: invalidKeys as any,
        usedFallbackKeys: usedFallbackKeys as any,
        acceptedEmptyKeys: acceptedEmptyKeys as any,
      },
    };
  }

  /**
   * Validate NON-EMPTY input (null/undefined should be handled before calling this).
   */
  private validateNonEmptyValue(
    v: any,
    decl: PropSpec
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
    decl: PropSpec,
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

  private fireWatch(run: any, prev: PropsSnapshot<P>, next: PropsSnapshot<P>) {
    const prevObj = prev as any;
    const nextObj = next as any;
    const allKeys = Object.keys(this.specs);

    const changedAll = diffKeys<P>(prevObj, nextObj, allKeys);

    for (const w of this.watchAll) {
      if (changedAll.length === 0) continue;
      const info: WatchInfo<P> = {
        changedKeysAll: changedAll,
        changedKeysMatched: changedAll,
      };
      w.cb(run, next, prev, info);
    }

    for (const w of this.watch) {
      const matched = diffKeys<P>(prevObj, nextObj, w.keys);
      if (matched.length === 0) continue;
      const info: WatchInfo<P> = {
        changedKeysAll: changedAll,
        changedKeysMatched: matched,
      };
      w.cb(run, next, prev, info);
    }
  }

  private fireWatchRaw(
    run: any,
    prevRaw: Readonly<P & PropsBaseType>,
    nextRaw: Readonly<P & PropsBaseType>
  ) {
    const prevObj = prevRaw as any;
    const nextObj = nextRaw as any;

    const unionKeys = Array.from(
      new Set([...Object.keys(prevObj), ...Object.keys(nextObj)])
    );

    const changedAll = diffKeys<P & PropsBaseType>(prevObj, nextObj, unionKeys);

    for (const w of this.watchRawAll) {
      if (w.devWarn) {
        this.diags.push({
          level: "warning",
          message: `[Props] watchRawAll() is an escape hatch; avoid in official prototypes.`,
        });
      }
      if (changedAll.length === 0) continue;
      const info: WatchInfo<P & PropsBaseType> = {
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
      const matched = diffKeys<P & PropsBaseType>(prevObj, nextObj, w.keys);
      if (matched.length === 0) continue;
      const info: WatchInfo<P & PropsBaseType> = {
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
    this.raw = Object.freeze({} as Readonly<P & PropsBaseType>);
    this.resolved = Object.freeze({} as PropsSnapshot<P>);
  }
}
