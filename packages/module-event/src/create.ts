// packages/module-event/src/create.ts
import { createModule } from "@proto-ui/module-base";
import type { ModuleFactoryArgs } from "@proto-ui/module-base";

import type { EventFacade, EventModule, EventPort } from "./types";
import { EventModuleImpl } from "./impl";

export function createEventModule(ctx: ModuleFactoryArgs): EventModule {
  const { init, caps } = ctx;

  return createModule<"event", "instance", EventFacade, EventPort>({
    name: "event",
    scope: "instance",
    init,
    caps,
    build: ({ init, caps }) => {
      const impl = new EventModuleImpl(caps, init.prototypeName);

      return {
        facade: {
          on: (type, options) => impl.on(type, options),
          onGlobal: (type, options) => impl.onGlobal(type, options),
          off: (token) => impl.off(token),
        },
        hooks: {
          onProtoPhase: (p) => impl.onProtoPhase(p),
        },
        port: {
          bind: (dispatch) => impl.bind(dispatch),
          unbind: () => impl.unbind(),
          getDiagnostics: () => impl.getDiagnostics(),
          redirectRoot: (target) => impl.redirectRoot(target),
        },
      };
    },
  });
}
