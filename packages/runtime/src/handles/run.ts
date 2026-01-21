// packages/runtime/src/handles/run.ts
import { PropsBaseType } from "@proto-ui/types";
import { ModuleHub } from "../module-hub";
import { RunHandle } from "@proto-ui/core";
import { PropsFacade } from "@proto-ui/module-props";

export const createRunHandle = <P extends PropsBaseType>(
  update: RunHandle<P>["update"],
  moduleHub: ModuleHub
): RunHandle<P> => {
  const facades = moduleHub.getFacades();
  const props = facades["props"] as PropsFacade<P>;

  return {
    update,
    props: {
      get: () => props.get(),
      getRaw: () => props.getRaw(),
      isProvided: (k: string) => props.isProvided(k),
    },
  };
};
