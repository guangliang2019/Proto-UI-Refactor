// packages/module-state/src/create.ts
import { createModule } from "@proto-ui/module-base";
import type { ModuleFactoryArgs, WithSystemCaps } from "@proto-ui/module-base";
import { StateModuleImpl } from "./impl";
import type { StateCaps, StateFacade, StateModule } from "./types";

export function createStateModule(
  ctx: ModuleFactoryArgs<StateCaps & WithSystemCaps>
): StateModule {
  const { init, caps } = ctx;
  return createModule<"state", "instance", StateCaps, StateFacade>({
    name: "state",
    scope: "instance",
    init,
    caps,
    build: ({ caps }) => {
      const sys = caps.get("__sys");
      const impl = new StateModuleImpl(sys);

      return {
        facade: impl.facade,
        hooks: {
          dispose: () => impl.dispose(),
        },
        // no port in v0
      };
    },
  });
}
