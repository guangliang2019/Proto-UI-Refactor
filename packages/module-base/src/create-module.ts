import type {
  ModuleFacade,
  ModuleInternal,
  ModuleInstance,
  ModuleInit,
  ModuleScope,
} from "@proto-ui/core";
import type { CapsVaultView } from "./caps-vault";

export type ModuleFactoryArgs<Caps extends object> = {
  init: ModuleInit;
  caps: CapsVaultView<Caps>;
};

export function createModule<
  Name extends string,
  Caps extends object,
  Facade extends ModuleFacade,
  Internal extends ModuleInternal
>(args: {
  name: Name;
  scope: ModuleScope;
  init: ModuleInit;
  caps: CapsVaultView<Caps>;
  build: (ctx: ModuleFactoryArgs<Caps>) => {
    facade: Facade;
    internal: Internal;
  };
}): ModuleInstance<Facade, Internal> & { name: Name; scope: ModuleScope } {
  const { facade, internal } = args.build({ init: args.init, caps: args.caps });
  return {
    name: args.name,
    scope: args.scope,
    facade,
    internal,
  };
}
