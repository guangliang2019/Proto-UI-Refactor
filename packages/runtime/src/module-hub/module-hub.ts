// packages/runtime/src/module-hub/module-hub.ts
import type { ModuleFacade, ModuleInit, ProtoPhase } from "@proto-ui/core";
import {
  CapsVault,
  asCapsController,
  type CapsController,
} from "@proto-ui/module-base";
import type { AnyModule, ModuleHub, ModuleRecord } from "./types";

type ModuleFactory<Caps extends object> = (
  init: ModuleInit,
  caps: any
) => AnyModule;
// caps: any 是为了不把 runtime 写死在某个 caps view 类型上；你也可以更严格地泛型化。

export class RuntimeModuleHub implements ModuleHub {
  private records: Array<ModuleRecord<any>> = [];
  private facades: Record<string, ModuleFacade> = {};
  private phase: ProtoPhase = "setup";

  constructor(
    init: ModuleInit,
    factories: Array<{ name: string; create: ModuleFactory<any> }>
  ) {
    for (const f of factories) {
      const vault = new CapsVault<any>();
      const controller = asCapsController(vault);

      const mod = f.create(init, vault); // vault 同时满足 CapsVaultView（有 get/has/onChange/epoch）

      this.records.push({
        name: mod.name,
        vault,
        controller,
        module: mod,
      });

      // expose facade by module name
      this.facades[mod.name] = mod.facade as ModuleFacade;
    }
  }

  setProtoPhase(phase: ProtoPhase): void {
    this.phase = phase;
    for (const r of this.records) {
      r.module.hooks.onProtoPhase?.(phase);
    }
  }

  afterRenderCommit(): void {
    for (const r of this.records) {
      r.module.hooks.afterRenderCommit?.();
    }
  }

  getFacades(): Record<string, ModuleFacade> {
    return this.facades;
  }

  getCapsController<Caps extends object>(
    moduleName: string
  ): CapsController<Caps> | undefined {
    const r = this.records.find((x) => x.name === moduleName);
    return r?.controller;
  }

  dispose(): void {
    // If modules need explicit disposal, add ModuleInternal.dispose later.
    for (const r of this.records) {
      r.module.hooks.dispose?.();
      // reset caps to signal detach
      r.controller.reset();
    }
    this.records = [];
    this.facades = {};
  }

  getPort<T>(moduleName: string): T | undefined {
    const r = this.records.find((x) => x.name === moduleName);
    return (r?.module as any).port as T | undefined;
  }
}
