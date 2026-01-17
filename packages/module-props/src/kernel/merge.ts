// packages/module-props/src/kernel/merge.ts
import type {
    EmptyBehavior,
    PropsBaseType,
    PropSpec,
    PropsSpecMap,
  } from "@proto-ui/types";
  
  export type MergeDiagLevel = "warning" | "error";
  
  export type MergeDiag = {
    level: MergeDiagLevel;
    key?: string;
    message: string;
  };
  
  export type MergeResult<P extends PropsBaseType> = {
    specs: PropsSpecMap<P>;
    diags: MergeDiag[];
  };
  
  function isSupersetEnum(next?: readonly any[], prev?: readonly any[]) {
    if (!prev || prev.length === 0) return true;
    if (!next) return false;
    const set = new Set(next.map(String));
    return prev.every((x) => set.has(String(x)));
  }
  
  function isSubsetEnum(next?: readonly any[], prev?: readonly any[]) {
    if (!next || next.length === 0) return true;
    if (!prev) return false;
    const set = new Set(prev.map(String));
    return next.every((x) => set.has(String(x)));
  }
  
  function rangeWider(
    next?: { min?: number; max?: number },
    prev?: { min?: number; max?: number }
  ) {
    if (!prev) return true;
    if (!next) return false;
  
    const prevMin = prev.min ?? -Infinity;
    const prevMax = prev.max ?? Infinity;
    const nextMin = next.min ?? -Infinity;
    const nextMax = next.max ?? Infinity;
  
    // wider means allowing <= prevMin and >= prevMax (or equal)
    return nextMin <= prevMin && nextMax >= prevMax;
  }
  
  function rangeNarrower(
    next?: { min?: number; max?: number },
    prev?: { min?: number; max?: number }
  ) {
    if (!next) return true;
    if (!prev) return false;
  
    const prevMin = prev.min ?? -Infinity;
    const prevMax = prev.max ?? Infinity;
    const nextMin = next.min ?? -Infinity;
    const nextMax = next.max ?? Infinity;
  
    return nextMin > prevMin || nextMax < prevMax;
  }
  
  export function mergeSpecs<A extends PropsBaseType, B extends PropsBaseType>(
    base: PropsSpecMap<A>,
    incoming: PropsSpecMap<B>
  ): MergeResult<A & B> {
    const out: PropsSpecMap<A & B> = { ...base } as PropsSpecMap<A & B>;
    const diags: MergeDiag[] = [];
  
    for (const key of Object.keys(incoming)) {
      const next = incoming[key]!;
      const prev = (out as any)[key];
  
      if (!prev) {
        (out as any)[key] = { ...next };
        continue;
      }
  
      // kind conflict
      if ((prev.kind ?? "any") !== (next.kind ?? "any")) {
        diags.push({
          level: "error",
          key,
          message: `kind conflict: ${prev.kind} vs ${next.kind}`,
        });
        continue;
      }
  
      // empty behavior: allow looser with warning; stricter is error
      const prevEmpty: EmptyBehavior = prev.empty ?? "fallback";
      const nextEmpty: EmptyBehavior = next.empty ?? "fallback";
  
      const rank = (e: EmptyBehavior) =>
        e === "accept" ? 0 : e === "fallback" ? 1 : 2;
  
      if (hasOwn(next, "empty")) {
        // disallow explicit undefined (avoid silent reset)
        if ((next as any).empty === undefined) {
          diags.push({
            level: "error",
            key,
            message: `empty must be one of "fallback" | "accept" | "error" (do not set undefined)`,
          });
          continue;
        }
  
        const pr = rank(prevEmpty);
        const nr = rank(nextEmpty);
  
        if (nr > pr) {
          diags.push({
            level: "error",
            key,
            message: `empty behavior becomes stricter (${prevEmpty} -> ${nextEmpty})`,
          });
          continue;
        }
        if (nr < pr) {
          diags.push({
            level: "warning",
            key,
            message: `empty behavior becomes looser (${prevEmpty} -> ${nextEmpty})`,
          });
        }
      }
  
      // enum: allow superset with warning; subset is error
      if (prev.enum || next.enum) {
        if (!isSupersetEnum(next.enum, prev.enum)) {
          diags.push({
            level: "error",
            key,
            message: `enum becomes stricter (subset)`,
          });
          continue;
        }
        if (!isSupersetEnum(prev.enum, next.enum)) {
          // next is superset compared to prev
          diags.push({
            level: "warning",
            key,
            message: `enum widened (superset)`,
          });
        }
      }
  
      // range: allow wider with warning; narrower is error
      if (prev.range || next.range) {
        if (rangeNarrower(next.range, prev.range)) {
          diags.push({
            level: "error",
            key,
            message: `range becomes stricter (narrower)`,
          });
          continue;
        }
        if (!rangeWider(prev.range, next.range)) {
          diags.push({
            level: "warning",
            key,
            message: `range widened`,
          });
        }
      }
  
      // validator: any addition/change is "potentially stricter" => error (we freeze this)
      if (prev.validator || next.validator) {
        const same = prev.validator === next.validator;
        if (!same) {
          diags.push({
            level: "error",
            key,
            message: `validator change is considered stricter/ambiguous; disallowed in merge`,
          });
          continue;
        }
      }
  
      // default overwrite allowed but warning (prefer setDefaults)
      const hasPrevDefault = "default" in prev;
      const hasNextDefault = "default" in next;
      if (hasPrevDefault && hasNextDefault && prev.default !== next.default) {
        diags.push({
          level: "warning",
          key,
          message: `default overridden in define(); prefer setDefaults()`,
        });
      }
  
      // merge result: deterministic
      (out as any)[key] = {
        ...prev,
        ...next,
        // keep kind stable
        kind: prev.kind,
        // empty behavior: keep previous unless explicitly overridden (change validated above)
        empty: hasOwn(next, "empty") ? next.empty : prev.empty,
        // enum/range: choose widened representation (incoming is superset/wider or equal by checks)
        enum: next.enum ?? prev.enum,
        range: next.range ?? prev.range,
        // validator kept identical (checked)
        validator: prev.validator,
      } satisfies PropSpec;
    }
  
    return { specs: out, diags };
  }
  
  function hasOwn(obj: any, key: string) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }
  