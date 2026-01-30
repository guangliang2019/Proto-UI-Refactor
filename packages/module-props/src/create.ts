// packages/module-props/src/create.ts
import { createModule } from "@proto-ui/module-base";
import type { ModuleFactoryArgs, WithSystemCaps } from "@proto-ui/module-base";
import type { PropsBaseType } from "@proto-ui/types";

import type { PropsCaps, PropsFacade, PropsModule, PropsPort } from "./types";
import { PropsModuleImpl } from "./impl";

export function createPropsModule<P extends PropsBaseType>(
  ctx: ModuleFactoryArgs<PropsCaps<P> & WithSystemCaps>
): PropsModule<P> {
  const { init, caps } = ctx;
  return createModule<
    "props",
    "instance",
    PropsCaps<P>,
    PropsFacade<P>,
    PropsPort<P>
  >({
    name: "props",
    scope: "instance",
    init,
    caps,
    build: ({ init, caps }) => {
      const impl = new PropsModuleImpl<P>(caps, init.prototypeName);

      return {
        facade: {
          // setup-only (guarded in impl)
          define: (decl) => impl.define(decl),
          setDefaults: (partial) => impl.setDefaults(partial),
          watch: (keys, cb) => impl.watch(keys, cb),
          watchAll: (cb) => impl.watchAll(cb),
          watchRaw: (keys, cb) => impl.watchRaw(keys, cb),
          watchRawAll: (cb) => impl.watchRawAll(cb),

          // runtime
          get: () => impl.get(),
          getRaw: () => impl.getRaw(),
          isProvided: (key) => impl.isProvided(key),
        },
        hooks: {
          onProtoPhase: (p) => impl.onProtoPhase(p),
        },
        port: {
          syncFromHost: (run) => impl.syncFromHost(run),
          getDiagnostics: () => impl.getDiagnostics(),
          applyRaw: (nextRaw, run) => impl.applyRaw(nextRaw, run),
        },
      };
    },
  });
}
