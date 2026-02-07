// packages/runtime/src/orchestrator/module-hub/types.ts
import type {
  ModuleFacade,
  ModuleInstance,
  ModuleScope,
  ProtoPhase,
} from "@proto-ui/core";
import type { CapsController } from "../caps";

/**
 * A module instance in runtime.
 */
export type AnyModule = ModuleInstance<ModuleFacade> & {
  name: string;
  scope: ModuleScope;
};

/**
 * Facade-only view for places that must NOT touch ports.
 * Kernel should only depend on this.
 */
export interface ModuleHubFacadeView {
  /** runtime -> handles (facades are safe, stable, public) */
  getFacades(): Record<string, ModuleFacade>;
}

export interface ModuleHub extends ModuleHubFacadeView {
  /** runtime -> modules */
  setProtoPhase(phase: ProtoPhase): void;
  afterRenderCommit(): void;

  /** runtime -> ports (internal / privileged) */
  getPort<T>(moduleName: string): T | undefined;

  /** runtime -> adapter */
  getCapsController(moduleName: string): CapsController | undefined;

  /** lifecycle */
  dispose(): void;
}
