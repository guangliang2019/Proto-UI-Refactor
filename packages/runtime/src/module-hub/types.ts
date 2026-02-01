import type {
  ModuleFacade,
  ModuleInstance,
  ModuleScope,
  ProtoPhase,
} from "@proto-ui/core";
import type { CapsController } from "../caps";

export type AnyModule = ModuleInstance<ModuleFacade> & {
  name: string;
  scope: ModuleScope;
};

export interface ModuleHub {
  /** runtime -> modules */
  setProtoPhase(phase: ProtoPhase): void;
  afterRenderCommit(): void;

  /** runtime -> handles */
  getFacades(): Record<string, ModuleFacade>;

  /** runtime -> ports */
  getPort<T>(moduleName: string): T | undefined;

  /** runtime -> adapter */
  getCapsController(moduleName: string): CapsController | undefined;

  /** lifecycle */
  dispose(): void;
}
