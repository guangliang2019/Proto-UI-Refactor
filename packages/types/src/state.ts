// packages/types/src/state.ts

/** State semantic spec (data-only contract). */
export type StateSpec =
  | BoolStateSpec
  | EnumStateSpec
  | StringStateSpec
  | NumberRangeStateSpec
  | NumberDiscreteStateSpec;

export type BoolStateSpec = { kind: "bool" };

export type EnumStateSpec = {
  kind: "enum";
  options: readonly string[];
};

export type StringStateSpec = {
  kind: "string";
  options?: readonly string[];
};

export type NumberRangeStateSpec = {
  kind: "number.range";
  min: number;
  max: number;
  clamp?: boolean;
};

export type NumberDiscreteStateSpec = {
  kind: "number.discrete";
  options?: readonly number[];
  min?: number;
  max?: number;
  step?: number;
};

/** Reason is intentionally unknown (policy/shape is up to app/framework). */
export type StateSetReason = unknown;

export type DisconnectReason = "unmount";

/** Event shape used by watch/subscribe. */
export type StateEvent<V> =
  | { type: "next"; next: V; prev: V; reason?: StateSetReason }
  | { type: "disconnect"; reason: DisconnectReason };

/** Value inference helper (mainly for enum literal union). */
export type StateValueOfSpec<S extends StateSpec> = S["kind"] extends "bool"
  ? boolean
  : S["kind"] extends "enum"
  ? S extends { options: readonly (infer T)[] }
    ? Extract<T, string>
    : string
  : S["kind"] extends "string"
  ? string
  : S["kind"] extends "number.range" | "number.discrete"
  ? number
  : never;
