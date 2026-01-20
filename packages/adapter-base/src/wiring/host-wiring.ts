// packages/adapter-base/src/wiring/host-wiring.ts
import type { HostWiring, WiringSpec } from "../types";
import type { ModuleHub } from "@proto-ui/runtime";
import type { CapsController } from "@proto-ui/module-base";

export function createHostWiring(args: {
  prototypeName: string;
  modules: WiringSpec;
}): HostWiring {
  const { prototypeName, modules } = args;

  // hold controllers so we can reset them later (adapter side)
  const controllers = new Map<string, CapsController<any>>();

  return {
    onRuntimeReady(capsHub: ModuleHub) {
      for (const [name, provide] of Object.entries(modules)) {
        const controller = capsHub.getCapsController<any>(name);
        if (!controller) continue;

        controllers.set(name, controller);

        const partial = provide({ prototypeName });
        controller.attach(partial);
      }
    },

    afterUnmount() {
      // IMPORTANT: called after invokeUnmounted()
      // In most cases, moduleHub.dispose already invalidates caps vaults.
      // But adapters might still want to reset controllers to be explicit and avoid leaks
      // when hosts reuse instances (rare, but WC tests sometimes simulate odd patterns).
      for (const [name, c] of controllers) {
        try {
          c.reset();
        } catch (e) {
          // ignore in v0; but keep a hook point for future diagnostics
          // maybe: devWarn(`[Wiring] reset failed: ${prototypeName}/${name}`, e)
        }
      }
      controllers.clear();
    },
  };
}
