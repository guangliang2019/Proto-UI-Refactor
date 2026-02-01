// packages/module-base/src/create-module.ts
import type {
  ModuleFacade,
  ModuleHooks,
  ModuleInstance,
  ModuleInit,
  ModuleScope,
  CapsVaultView,
} from "@proto-ui/core";

export type ModuleFactoryArgs = {
  init: ModuleInit;
  caps: CapsVaultView;
};

export function createModule<
  Name extends string,
  Scope extends ModuleScope,
  Facade extends ModuleFacade,
  Port = undefined
>(args: {
  name: Name;
  scope: Scope;
  init: ModuleInit;
  caps: CapsVaultView;
  build: (ctx: ModuleFactoryArgs) => {
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
