// packages/props/src/types.ts

export type PropKind = "any" | "boolean" | "string" | "number" | "object";

export type EmptyBehavior = "fallback" | "accept" | "error";

export type PropDecl = {
  kind: PropKind;

  /**
   * How to treat empty input (missing / undefined / null)
   * - fallback: use prevValid > defaults > decl.default > null
   * - accept: resolved value becomes null (canonical empty)
   * - error: throw if empty and no non-empty fallback available
   */
  empty?: EmptyBehavior;

  // schema
  enum?: readonly (string | number | boolean)[];
  range?: { min?: number; max?: number };

  // validation
  validator?: (v: any) => boolean;

  // default (discouraged; prefer setDefaults)
  default?: any;
};

export type PropsDeclMap = Record<string, PropDecl>;

export type DefineInput = PropsDeclMap;

export type PropsDefaults = Record<string, any>;

export type PropsResolveMeta = {
  providedKeys: string[];
  invalidKeys: string[];
  usedDefaultsKeys: string[];
};

export type PropsSnapshot = Readonly<Record<string, any>>;

export type WatchInfo = {
  changedKeysAll: string[];
  changedKeysMatched: string[];
};

export type PropsWatchCallback<Run = any> = (
  run: Run,
  next: PropsSnapshot,
  prev: PropsSnapshot,
  info: WatchInfo
) => void;

export type RawWatchCallback<Run = any> = (
  run: Run,
  nextRaw: Readonly<Record<string, any>>,
  prevRaw: Readonly<Record<string, any>>,
  info: WatchInfo
) => void;
