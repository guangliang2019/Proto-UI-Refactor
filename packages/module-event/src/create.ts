// packages/module-event/src/create.ts
import type { ModuleInit } from "@proto-ui/core";
import { createModule } from "@proto-ui/module-base";
import type { CapsVaultView } from "@proto-ui/module-base";

import type { EventCaps, EventFacade, EventModule, EventPort } from "./types";
import { EventModuleImpl } from "./impl";
import { PropsBaseType } from "@proto-ui/types";

export function createEventModule<P extends PropsBaseType>(
  init: ModuleInit,
  caps: CapsVaultView<EventCaps>
): EventModule<P> {
  return createModule<
    "event",
    "instance",
    EventCaps,
    EventFacade<P>,
    EventPort<P>
  >({
    name: "event",
    scope: "instance",
    init,
    caps,
    build: ({ init, caps }) => {
      const impl = new EventModuleImpl(caps, init.prototypeName);

      return {
        facade: {
          on: (type, cb, options) => impl.on(type, cb, options),
          off: (type, cb, options) => impl.off(type, cb, options),
          onGlobal: (type, cb, options) => impl.onGlobal(type, cb, options),
          offGlobal: (type, cb, options) => impl.offGlobal(type, cb, options),
          offToken: (token) => impl.offToken(token),
        },
        hooks: {
          onProtoPhase: (p) => impl.onProtoPhase(p),
        },
        port: {
          bind: (run) => impl.bind(run),
          unbind: () => impl.unbind(),
          getDiagnostics: () => impl.getDiagnostics(),
        },
      };
    },
  });
}
