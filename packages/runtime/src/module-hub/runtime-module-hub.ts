import type { ModuleFacade, ProtoPhase } from "@proto-ui/core";
import type { CapEntries } from "@proto-ui/core";
import {
  SYS_CAP,
  type SystemCaps,
  type ExecPhase,
  CapsVault,
} from "@proto-ui/module-base";

import type { AnyModule, ModuleHub } from "./types";
import type { CapsController } from "../caps";

type ModuleFactory = (ctx: {
  init: { prototypeName: string };
  caps: CapsVault; // implements CapsVaultView (core)
}) => AnyModule;

type ModuleDecl = { name: string; create: ModuleFactory };

type ModuleRecord = {
  name: string;
  vault: CapsVault;
  controller: CapsController;
  module: AnyModule;
};

export class RuntimeModuleHub implements ModuleHub {
  private readonly prototypeName: string;
  private readonly getExecPhase: () => ExecPhase;

  private protoPhase: ProtoPhase = "setup";
  private disposed = false;

  private records: ModuleRecord[] = [];
  private facades: Record<string, ModuleFacade> = {};
  private ports: Record<string, any> = {};

  // runtime-owned callback ctx (opaque)
  private callbackCtx: unknown = undefined;

  constructor(
    init: { prototypeName: string; getPhase: () => ExecPhase },
    modules: ModuleDecl[]
  ) {
    this.prototypeName = init.prototypeName;
    this.getExecPhase = init.getPhase;

    const fail = (msg: string) => {
      throw new Error(`[Runtime] ${msg}`);
    };

    // --- sys caps implementation (runtime-owned object) ---
    const sys: SystemCaps = {
      execPhase: () => this.getExecPhase(),
      domain: () => (this.getExecPhase() === "setup" ? "setup" : "runtime"),
      protoPhase: () => this.protoPhase,
      isDisposed: () => this.disposed,

      ensureNotDisposed: (op) => {
        if (this.disposed) fail(`${this.prototypeName} is disposed. op=${op}`);
      },

      ensureExecPhase: (op, expected) => {
        if (this.disposed) fail(`${this.prototypeName} is disposed. op=${op}`);

        const actual = this.getExecPhase();
        const ex = Array.isArray(expected) ? expected : [expected];
        if (!ex.includes(actual)) {
          fail(
            `exec-phase violation: ${this.prototypeName} op=${op} ` +
              `expected=${ex.join("|")} actual=${actual} protoPhase=${this.protoPhase}`
          );
        }
      },

      ensureSetup: (op) => {
        sys.ensureExecPhase(op, "setup");
      },

      ensureRuntime: (op) => {
        if (this.disposed) fail(`${this.prototypeName} is disposed. op=${op}`);
        if (this.getExecPhase() === "setup") {
          fail(
            `runtime-only violation: ${this.prototypeName} op=${op} ` +
              `actual=setup protoPhase=${this.protoPhase}`
          );
        }
      },

      ensureCallback: (op) => {
        sys.ensureExecPhase(op, "callback");
      },

      getCallbackCtx: () => {
        // only meaningful in callback phase; otherwise return undefined
        return this.getExecPhase() === "callback" ? this.callbackCtx : undefined;
      },
    };

    // internal private hook for runtime only (NOT part of SystemCaps)
    (sys as any).__setCallbackCtx = (ctx: unknown) => {
      this.callbackCtx = ctx;
    };

    for (const m of modules) {
      const vault = new CapsVault();

      // base layer: SYS_CAP must survive host reset
      vault.attachBase([[SYS_CAP, sys]]);

      // adapter-facing controller (with reserved enforcement)
      const controller = this.createController(m.name, vault);

      // create module
      const module: AnyModule = m.create({
        init: { prototypeName: this.prototypeName },
        caps: vault,
      });

      // record
      this.records.push({ name: m.name, vault, controller, module });

      // expose facade/port
      this.facades[m.name] = module.facade;
      if ((module as any).port !== undefined) {
        this.ports[m.name] = (module as any).port;
      }
    }
  }

  // -------------------------
  // adapter-facing controller
  // -------------------------

  private createController(
    moduleName: string,
    vault: CapsVault
  ): CapsController {
    const prototypeName = this.prototypeName;

    const findReserved = (entries: CapEntries): string | null => {
      for (const [token] of entries) {
        // reserved caps must not be overridden by host wiring
        if (token.id === SYS_CAP.id) return token.id;
      }
      return null;
    };

    return {
      attach: (entries: CapEntries) => {
        const reserved = findReserved(entries);
        if (reserved) {
          throw new Error(
            `[Wiring] ${prototypeName}/${moduleName} attempted to provide reserved cap: ${reserved}`
          );
        }
        vault.attach(entries);
      },

      reset: () => {
        // clear ONLY host layer
        vault.resetAttached();
      },
    };
  }

  // -------------------------
  // runtime -> modules
  // -------------------------

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

  // -------------------------
  // runtime -> handles
  // -------------------------

  getFacades(): Record<string, ModuleFacade> {
    return this.facades;
  }

  // -------------------------
  // runtime -> ports
  // -------------------------

  getPort<T>(moduleName: string): T | undefined {
    return this.ports[moduleName] as T | undefined;
  }

  // -------------------------
  // runtime -> adapter
  // -------------------------

  getCapsController(moduleName: string): CapsController | undefined {
    const rec = this.records.find((r) => r.name === moduleName);
    return rec?.controller;
  }

  // -------------------------
  // runtime internal: callback ctx
  // -------------------------

  /**
   * Runtime-only helper: set callback ctx for modules to consume via SYS_CAP.getCallbackCtx().
   * This is intentionally not part of ModuleHub interface and not visible to modules directly.
   */
  __setCallbackCtx(ctx: unknown): void {
    // SYS_CAP is already attached and stable; we mutate runtime-owned field
    this.callbackCtx = ctx;
  }

  // -------------------------
  // lifecycle
  // -------------------------

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // best-effort clear callback ctx
    this.callbackCtx = undefined;

    // dispose hooks first so modules can teardown while caps still readable (sys still available)
    for (const r of this.records) {
      r.module.hooks.dispose?.();
    }

    // invalidate host-attached caps only (sys remains)
    for (const r of this.records) {
      try {
        r.vault.resetAttached();
      } catch {
        // ignore in v0
      }
    }
  }
}
