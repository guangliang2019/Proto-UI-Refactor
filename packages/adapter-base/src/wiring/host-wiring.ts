// packages/adapter-base/src/wiring/host-wiring.ts
import type { HostWiring, WiringSpec } from "../types";
import type { ModuleHub } from "@proto-ui/runtime";
import type { CapsController } from "@proto-ui/module-base";

const RESERVED_SYSTEM_KEYS = new Set(["__sys"]);

export function createHostWiring(args: {
  prototypeName: string;
  modules: WiringSpec;
}): HostWiring {
  const { prototypeName, modules } = args;

  const controllers = new Map<string, CapsController<any>>();

  return {
    onRuntimeReady(capsHub: ModuleHub) {
      for (const [name, provide] of Object.entries(modules)) {
        const controller = capsHub.getCapsController<any>(name);
        if (!controller) continue;

        controllers.set(name, controller);

        const partial = provide({ prototypeName });

        // forbid overriding system caps
        for (const k of Object.keys(partial as any)) {
          if (RESERVED_SYSTEM_KEYS.has(k)) {
            throw new Error(
              `[Wiring] ${prototypeName}/${name} attempted to provide reserved cap: ${k}`
            );
          }
        }

        controller.attach(partial);
      }
    },

    afterUnmount() {
      for (const [name, c] of controllers) {
        try {
          c.reset();
        } catch {
          // ignore in v0
        }
      }
      controllers.clear();
    },
  };
}
