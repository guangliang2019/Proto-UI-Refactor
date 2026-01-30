import type {
  ModuleFacade,
  ModuleHooks,
  ModuleInstance,
  ModuleInit,
  ModuleScope,
} from "@proto-ui/core";
import type { CapsVaultView } from "./caps-vault";
import type { WithSystemCaps } from "./system-caps";

export type ModuleFactoryArgs<Caps extends object> = {
  init: ModuleInit;
  caps: CapsVaultView<Caps & WithSystemCaps>;
};

export function createModule<
  Name extends string,
  Scope extends ModuleScope,
  Caps extends object,
  Facade extends ModuleFacade,
  Port = undefined
>(args: {
  name: Name;
  scope: Scope;
  init: ModuleInit;
  caps: CapsVaultView<Caps & WithSystemCaps>;
  build: (ctx: ModuleFactoryArgs<Caps>) => {
    facade: Facade;
    hooks?: ModuleHooks; // optional, default {}
    port?: Port; // optional
  };
}): ModuleInstance<Facade> & { name: Name; scope: Scope; port?: Port } {
  const { facade, hooks, port } = args.build({
    init: args.init,
    caps: args.caps,
  });
  return {
    name: args.name,
    scope: args.scope,
    facade,
    hooks: hooks ?? {},
    port,
  };
}
