// packages/modules/expose-state-web/src/types.ts
import type { ModuleInstance, ModulePort } from "@proto-ui/core";

export type ExposeStateWebFacade = {};

export type ExposeStateWebPort = ModulePort & {};

export type ExposeStateWebModule = ModuleInstance<ExposeStateWebFacade> & {
  name: "expose-state-web";
  scope: "instance";
};
