// packages/adapter-base/src/wiring/host-wiring.ts
import type { HostWiring, WiringSpec } from "../types";
import type { ModuleHub } from "@proto-ui/runtime";
import type { CapEntries } from "@proto-ui/core";

export function createHostWiring(args: {
  prototypeName: string;
  modules: WiringSpec;
}): HostWiring {
  const { prototypeName, modules } = args;

  const controllers = new Map<
    string,
    { attach(e: CapEntries): void; reset(): void }
  >();

  return {
    onRuntimeReady(hub: ModuleHub) {
      for (const [name, provide] of Object.entries(modules)) {
        const c = hub.getCapsController(name);
        if (!c) continue;
        controllers.set(name, c);

        const entries = provide({ prototypeName });
        c.attach(entries);
      }
    },

    afterUnmount() {
      for (const c of controllers.values()) {
        try {
          c.reset();
        } catch {
          // ignore v0
        }
      }
      controllers.clear();
    },
  };
}
