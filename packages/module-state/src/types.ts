// packages/module-state/src/types.ts
import type { ModuleInstance, OwnedStateHandle } from "@proto-ui/core";
import {
  EnumStateSpec,
  NumberDiscreteStateSpec,
  NumberRangeStateSpec,
  StringStateSpec,
} from "@proto-ui/types";

export type StateFacade = {
  bool: (semantic: string, defaultValue: boolean) => OwnedStateHandle<boolean>;

  enum: <O extends readonly string[]>(
    semantic: string,
    defaultValue: O[number],
    spec: EnumStateSpec<O>
  ) => OwnedStateHandle<O[number]>;

  string: (
    semantic: string,
    defaultValue: string,
    spec?: StringStateSpec
  ) => OwnedStateHandle<string>;

  numberRange: (
    semantic: string,
    defaultValue: number,
    spec: NumberRangeStateSpec
  ) => OwnedStateHandle<number>;

  numberDiscrete: (
    semantic: string,
    defaultValue: number,
    spec: NumberDiscreteStateSpec
  ) => OwnedStateHandle<number>;
};

export type StateModule = ModuleInstance<StateFacade> & {
  name: "state";
  scope: "instance";
  port?: never;
};
