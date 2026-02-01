import { createModule } from "@proto-ui/module-base";
import type { ModuleFactoryArgs } from "@proto-ui/module-base";
import type { TestSysModule } from "./types";
import { TestSysImpl } from "./impl";

export function createTestSysModule(ctx: ModuleFactoryArgs): TestSysModule {
  const { init, caps } = ctx;

  return createModule({
    name: "test-sys",
    scope: "instance",
    init,
    caps,
    build: ({ init, caps }) => {
      const impl = new TestSysImpl(caps, init.prototypeName);

      return {
        facade: {},
        hooks: {},
        port: impl.port(),
      };
    },
  }) as any;
}
