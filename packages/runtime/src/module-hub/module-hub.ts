// packages/runtime/src/module-hub/module-hub.ts
import type { ModuleFacade, ProtoPhase } from "@proto-ui/core";
import {
  CapsVault,
  SystemCaps,
  asCapsController,
  type CapsController,
  type ExecPhase,
} from "@proto-ui/module-base";
import type { AnyModule, ModuleHub, ModuleRecord } from "./types";

export class RuntimeModuleHub implements ModuleHub {
  private readonly prototypeName: string;
  private readonly getPhase: () => ExecPhase;

  private protoPhase: ProtoPhase = "setup";
  private disposed = false;

  private records: ModuleRecord<any>[] = [];
  private facades: Record<string, ModuleFacade> = {};
  private ports: Record<string, any> = {};

  constructor(
    init: { prototypeName: string; getPhase: () => ExecPhase },
    modules: Array<{ name: string; create: any }>
  ) {
    this.prototypeName = init.prototypeName;
    this.getPhase = init.getPhase;

    const fail = (msg: string) => {
      throw new Error(`[Runtime] ${msg}`);
    };

    const sys: SystemCaps = {
      execPhase: () => this.getPhase(),
      domain: () => (this.getPhase() === "setup" ? "setup" : "runtime"),
      protoPhase: () => this.protoPhase,
      isDisposed: () => this.disposed,

      ensureNotDisposed: (op) => {
        if (this.disposed) fail(`${this.prototypeName} is disposed. op=${op}`);
      },

      ensureExecPhase: (op, expected) => {
        if (this.disposed) fail(`${this.prototypeName} is disposed. op=${op}`);

        const actual = this.getPhase();
        const ex = Array.isArray(expected) ? expected : [expected];
        if (!ex.includes(actual)) {
          fail(
            `exec-phase violation: ${this.prototypeName} op=${op} ` +
              `expected=${ex.join("|")} actual=${actual} protoPhase=${
                this.protoPhase
              }`
          );
        }
      },

      ensureSetup: (op) => sys.ensureExecPhase(op, "setup"),
      ensureRuntime: (op) => {
        // runtime = not setup (render/callback/unknown)
        if (this.disposed) fail(`${this.prototypeName} is disposed. op=${op}`);
        if (this.getPhase() === "setup") {
          fail(
            `runtime-only violation: ${this.prototypeName} op=${op} ` +
              `actual=setup protoPhase=${this.protoPhase}`
          );
        }
      },
      ensureCallback: (op) => sys.ensureExecPhase(op, "callback"),
    };

    for (const m of modules) {
      const vault = new CapsVault<any>();
      vault.attach({ __sys: sys });

      const controller = asCapsController(vault);
      const module: AnyModule = m.create({
        init: { prototypeName: this.prototypeName },
        caps: vault,
      });

      this.records.push({ name: m.name, vault, controller, module });
      this.facades[m.name] = module.facade;
      if ((module as any).port !== undefined)
        this.ports[m.name] = (module as any).port;
    }
  }

  setProtoPhase(phase: ProtoPhase): void {
    this.protoPhase = phase;
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

  getPort<T>(moduleName: string): T | undefined {
    return this.ports[moduleName] as T | undefined;
  }

  getCapsController<Caps extends object>(
    moduleName: string
  ): CapsController<Caps> | undefined {
    const rec = this.records.find((r) => r.name === moduleName);
    return rec?.controller as any;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // dispose hooks first so modules can teardown while caps still readable
    for (const r of this.records) {
      r.module.hooks.dispose?.();
    }

    // invalidate caps
    for (const r of this.records) {
      try {
        r.vault.reset();
      } catch {
        // ignore v0
      }
    }
  }
}
