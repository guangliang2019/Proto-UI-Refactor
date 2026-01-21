// packages/module-props/src/types.ts
import type {
  PropsDefaults,
  PropsSnapshot,
  PropsWatchCallback,
  RawWatchCallback,
  RunHandle,
} from "@proto-ui/core";
import type { ModuleInstance } from "@proto-ui/core";
import type { PropsBaseType, PropsSpecMap } from "@proto-ui/types";
import { PropsKernelDiag } from "./kernel";

export type RawPropsSource<P extends PropsBaseType> = {
  get(): Readonly<P & PropsBaseType>;
  subscribe(cb: () => void): () => void;
  debugName?: string;
};

export type PropsCaps<P extends PropsBaseType> = {
  rawPropsSource: RawPropsSource<P>;
};

export type PropsFacade<P extends PropsBaseType> = {
  // setup-only
  define(decl: PropsSpecMap<P>): void;
  setDefaults(partialDefaults: PropsDefaults<P>): void;
  watch(keys: (keyof P & string)[], cb: PropsWatchCallback<P>): void;
  watchAll(cb: PropsWatchCallback<P>): void;
  watchRaw(
    keys: (keyof P & string)[],
    cb: RawWatchCallback<P & PropsBaseType>
  ): void;
  watchRawAll(cb: RawWatchCallback<P & PropsBaseType>): void;

  // runtime/read
  get(): PropsSnapshot<P>;
  getRaw(): Readonly<P & PropsBaseType>;
  isProvided(key: keyof P): boolean;
};

export type PropsModule<P extends PropsBaseType> = ModuleInstance<
  PropsFacade<P>
> & {
  name: "props";
  scope: "instance";
};

export type PropsPort<P extends PropsBaseType> = {
  /**
   * Push raw directly (used by runtime controller.applyProps()).
   * Must trigger watches (hydration rules still apply).
   * Must NOT render.
   */
  applyRaw(nextRaw: Record<string, any>, run?: RunHandle<P>): void;

  /**
   * Pull from rawPropsSource if present and dirty.
   * Used by runtime at safe points (before render / before callbacks).
   */
  syncFromHost(run?: RunHandle<P>): void;

  /** Optional: expose diags to runtime/devtools */
  getDiagnostics?(): readonly PropsKernelDiag[];
};
