// packages/module-state/src/create.ts
import { createModule } from "@proto-ui/module-base";
import type { ModuleFactoryArgs } from "@proto-ui/module-base";
import { SYS_CAP } from "@proto-ui/module-base";

import { StateModuleImpl } from "./impl";
import type { StateFacade, StateModule } from "./types";

export function createStateModule(ctx: ModuleFactoryArgs): StateModule {
  const { init, caps } = ctx;

  return createModule<"state", "instance", StateFacade>({
    name: "state",
    scope: "instance",
    init,
    caps,
    build: ({ caps }) => {
      const sys = caps.get(SYS_CAP);
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
