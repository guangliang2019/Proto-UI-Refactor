// packages/runtime/src/module-host/types.ts
import type {
  ModuleFacade,
  ModuleInstance,
  ModuleScope,
  ProtoPhase,
} from "@proto-ui/core";
import type { CapsVault } from "@proto-ui/module-base";
import type { CapsController } from "@proto-ui/module-base";

export type AnyModule = ModuleInstance<ModuleFacade> & {
  name: string;
  scope: ModuleScope;
};

export type ModuleRecord<Caps extends object> = {
  name: string;
  vault: CapsVault<Caps>;
  controller: CapsController<Caps>;
  module: AnyModule;
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
  getCapsController<Caps extends object>(
    moduleName: string
  ): CapsController<Caps> | undefined;

  /** lifecycle */
  dispose(): void;
}
