// packages/module-base/src/create-module.ts
import type {
  ModuleFacade,
  ModuleHooks,
  ModuleInstance,
  ModuleInit,
  ModuleScope,
  ModuleHooks,
} from "@proto-ui/core";
import type { CapsVaultView } from "./caps-vault";

export type ModuleFactoryArgs<Caps extends object> = {
  init: ModuleInit;
  caps: CapsVaultView<Caps>;
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
  caps: CapsVaultView<Caps>;
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
