// packages/adapter-base/src/types.ts
import { CapEntries } from "@proto-ui/core";
import type { ModuleHub } from "@proto-ui/runtime";

export type ModuleName = string;

// moduleName -> caps-shape (typed by caller)
export type WiringSpec = Record<
  ModuleName,
  (init: { prototypeName: string }) => CapEntries
>;

export type HostWiring = {
  onRuntimeReady(caps: ModuleHub): void;
  onUnmountBegin?(): void;

  /**
   * Called AFTER invokeUnmounted() completed (modules are disposed),
   * for adapter-owned cleanup only.
   */
  afterUnmount(): void;
};
