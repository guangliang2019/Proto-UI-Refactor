// packages/module-state/src/types.ts
import type { OwnedStateHandle } from "@proto-ui/core";
import type {
  EnumSpec,
  NumberDiscreteSpec,
  NumberRangeSpec,
  StringSpec,
} from "./kernel";

// caps: v0 暂时无需额外 caps（仅依赖 __sys）
export type StateCaps = {};

export type StateFacade = {
  bool: (semantic: string, defaultValue: boolean) => OwnedStateHandle<boolean>;

  enum: <O extends readonly string[]>(
    semantic: string,
    defaultValue: O[number],
    spec: { options: O }
  ) => OwnedStateHandle<O[number]>;

  string: (
    semantic: string,
    defaultValue: string,
    spec?: { options?: readonly string[] }
  ) => OwnedStateHandle<string>;

  numberRange: (
    semantic: string,
    defaultValue: number,
    spec: Pick<NumberRangeSpec, "min" | "max" | "clamp">
  ) => OwnedStateHandle<number>;

  numberDiscrete: (
    semantic: string,
    defaultValue: number,
    spec: Pick<NumberDiscreteSpec, "options" | "min" | "max" | "step">
  ) => OwnedStateHandle<number>;
};

// module instance type (对齐你其他模块的导出习惯)
export type StateModule = {
  name: "state";
  scope: "instance";
  facade: StateFacade;
  hooks: {
    dispose?: () => void;
  };
  port?: never;
};

// internal (如果你还在用)
export interface StateModuleInternal {
  facade: StateFacade;
  dispose(): void;
}
