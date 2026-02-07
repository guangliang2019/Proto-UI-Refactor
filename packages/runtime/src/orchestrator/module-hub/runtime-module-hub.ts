// packages/runtime/src/orchestrator/module-hub/runtime-module-hub.ts
import type { ModuleFacade, ProtoPhase } from "@proto-ui/core";
import type { CapEntries, CapsVaultView } from "@proto-ui/core";
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
  caps: CapsVaultView; // IMPORTANT: view-only for modules
}) => AnyModule;

export type ModuleDecl = {
  name: string;
  create: ModuleFactory;

  /**
   * Hard dependencies:
   * - must exist
   * - must be initialized before this module
   */
  deps?: string[];

  /**
   * Optional dependencies:
   * - if present, should be initialized before this module
   * - if missing, ignore
   */
  optionalDeps?: string[];
};

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
  private recordByName = new Map<string, ModuleRecord>();

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
              `expected=${ex.join("|")} actual=${actual} protoPhase=${
                this.protoPhase
              }`
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
        return this.getExecPhase() === "callback"
          ? this.callbackCtx
          : undefined;
      },
    };

    // -------------------------
    // validate + sort modules
    // -------------------------
    const sorted = this.sortAndValidate(modules);

    // -------------------------
    // create modules
    // -------------------------
    for (const m of sorted) {
      const vault = new CapsVault();

      // base layer: SYS_CAP must survive host reset
      vault.attachBase([[SYS_CAP, sys]]);

      // adapter-facing controller (with reserved enforcement)
      const controller = this.createController(m.name, vault);

      // create module (caps passed as view only)
      const module: AnyModule = m.create({
        init: { prototypeName: this.prototypeName },
        caps: vault as unknown as CapsVaultView,
      });

      const rec: ModuleRecord = { name: m.name, vault, controller, module };

      // record
      this.records.push(rec);
      this.recordByName.set(m.name, rec);

      // expose facade/port
      this.facades[m.name] = module.facade;
      if ((module as any).port !== undefined) {
        this.ports[m.name] = (module as any).port;
      }
    }
  }

  private sortAndValidate(modules: ModuleDecl[]): ModuleDecl[] {
    // unique name check
    const seen = new Set<string>();
    for (const m of modules) {
      if (seen.has(m.name)) {
        throw new Error(
          `[Runtime] duplicate module name: ${this.prototypeName}/${m.name}`
        );
      }
      seen.add(m.name);
    }

    const byName = new Map<string, ModuleDecl>();
    for (const m of modules) byName.set(m.name, m);

    const hardDeps = (m: ModuleDecl) => m.deps ?? [];
    const optDeps = (m: ModuleDecl) => m.optionalDeps ?? [];

    // validate hard deps existence
    for (const m of modules) {
      for (const d of hardDeps(m)) {
        if (!byName.has(d)) {
          throw new Error(
            `[Runtime] missing module dependency: ${this.prototypeName}/${m.name} deps -> ${d}`
          );
        }
      }
    }

    // Build graph edges: dep -> m
    const indeg = new Map<string, number>();
    const out = new Map<string, string[]>();

    for (const m of modules) {
      indeg.set(m.name, 0);
      out.set(m.name, []);
    }

    const addEdge = (from: string, to: string) => {
      out.get(from)!.push(to);
      indeg.set(to, (indeg.get(to) ?? 0) + 1);
    };

    for (const m of modules) {
      for (const d of hardDeps(m)) addEdge(d, m.name);
      for (const d of optDeps(m)) {
        if (byName.has(d)) addEdge(d, m.name);
      }
    }

    // Kahn topo sort
    const q: string[] = [];
    for (const [name, v] of indeg) if (v === 0) q.push(name);

    const order: string[] = [];
    while (q.length) {
      const cur = q.shift()!;
      order.push(cur);
      for (const nxt of out.get(cur)!) {
        const v = (indeg.get(nxt) ?? 0) - 1;
        indeg.set(nxt, v);
        if (v === 0) q.push(nxt);
      }
    }

    if (order.length !== modules.length) {
      // find cycle-ish remainder for error msg
      const remains = [...indeg.entries()]
        .filter(([, v]) => v > 0)
        .map(([k]) => k)
        .join(", ");
      throw new Error(
        `[Runtime] module dependency cycle: ${this.prototypeName} remains=[${remains}]`
      );
    }

    return order.map((n) => byName.get(n)!);
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
    return this.recordByName.get(moduleName)?.controller;
  }

  // -------------------------
  // runtime internal: callback ctx
  // -------------------------

  __setCallbackCtx(ctx: unknown): void {
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

    // dispose hooks first so modules can teardown while caps still readable
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
