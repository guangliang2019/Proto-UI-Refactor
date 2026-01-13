export type PropsBaseType = Record<string, any>;
export type PropKind = "any" | "boolean" | "string" | "number" | "object";
export type EmptyBehavior = "fallback" | "accept" | "error";
export type PropSpec = {
    kind: PropKind;
    empty?: EmptyBehavior;
    enum?: readonly (string | number | boolean)[];
    range?: {
        min?: number;
        max?: number;
    };
    validator?: (v: any) => boolean;
    default?: any;
};
type Extends<A, B> = [A] extends [B] ? true : false;
type HasNull<V> = Extends<null, V>;
type AllowedKindsFor<V> = V extends boolean ? "boolean" | "any" : V extends string ? "string" | "any" : V extends number ? "number" | "any" : V extends object ? "object" | "any" : "any";
type AllowedEmptyFor<V> = HasNull<V> extends true ? EmptyBehavior : Exclude<EmptyBehavior, "accept">;
type SpecShape<K extends PropKind, V> = Omit<PropSpec, "kind" | "empty"> & {
    kind: K;
    empty?: AllowedEmptyFor<V>;
};
export type SpecForValue<V> = {
    [K in AllowedKindsFor<V>]: SpecShape<K, V>;
}[AllowedKindsFor<V>];
export type PropsSpecMap<P extends Record<string, any>> = {
    [K in keyof P & string]-?: SpecForValue<P[K]>;
};
export {};
