// packages/adapter-base/src/types.ts
import type { ModuleHub } from "@proto-ui/runtime"; 

export type ModuleName = string;

// moduleName -> caps-shape (typed by caller)
export type WiringSpec = Record<
  ModuleName,
  (ctx: { prototypeName: string }) => Record<string, any>
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
