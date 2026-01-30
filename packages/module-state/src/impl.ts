// packages/module-state/src/impl.ts
import type { OwnedStateHandle } from "@proto-ui/core";
import type { SystemCaps } from "@proto-ui/module-base";
import { StateKernel } from "./kernel";
import type { StateFacade, StateModuleInternal } from "./types";
import type { StateSetReason } from "@proto-ui/types";

function opOf(semantic: string, method: string) {
  // 你可以换成更“contract 风格”的 op 名字
  // 关键是错误信息稳定、可定位
  return `state(${semantic}).${method}`;
}

function wrapOwnedHandle<V>(
  raw: OwnedStateHandle<V>,
  sys: SystemCaps,
  semantic: string
): OwnedStateHandle<V> {
  const wrapped: OwnedStateHandle<V> = {
    get: () => {
      sys.ensureNotDisposed(opOf(semantic, "get"));
      return raw.get();
    },

    setDefault: (v) => {
      // setup-only
      sys.ensureSetup(opOf(semantic, "setDefault"));
      return raw.setDefault(v);
    },

    set: (v, reason?: StateSetReason) => {
      // callback-only (防 render-phase 变更)
      sys.ensureCallback(opOf(semantic, "set"));
      return raw.set(v, reason);
    },
  };

  // 继承 kernel 写入的 metadata（测试/调试/未来 module internal 可能会用）
  (wrapped as any).__stateId = (raw as any).__stateId;
  (wrapped as any).__stateSemantic = (raw as any).__stateSemantic ?? semantic;
  (wrapped as any).__stateKind = (raw as any).__stateKind;

  return wrapped;
}

export class StateModuleImpl implements StateModuleInternal {
  readonly kernel = new StateKernel();
  private disposed = false;

  constructor(private readonly sys: SystemCaps) {}

  readonly facade: StateFacade = {
    bool: (semantic, defaultValue) => {
      const h = this.kernel.define<boolean>(
        semantic,
        { kind: "bool" },
        defaultValue
      );
      return wrapOwnedHandle(h, this.sys, semantic);
    },

    enum: (semantic, defaultValue, spec) => {
      const h = this.kernel.define<any>(
        semantic,
        { kind: "enum", options: spec.options },
        defaultValue as any
      ) as OwnedStateHandle<any>;
      return wrapOwnedHandle(h, this.sys, semantic) as any;
    },

    string: (semantic, defaultValue, spec) => {
      const h = this.kernel.define<string>(
        semantic,
        { kind: "string", options: spec?.options },
        defaultValue
      );
      return wrapOwnedHandle(h, this.sys, semantic);
    },

    numberRange: (semantic, defaultValue, spec) => {
      const h = this.kernel.define<number>(
        semantic,
        {
          kind: "numberRange",
          min: spec.min,
          max: spec.max,
          clamp: spec.clamp,
        },
        defaultValue
      );
      return wrapOwnedHandle(h, this.sys, semantic);
    },

    numberDiscrete: (semantic, defaultValue, spec) => {
      const h = this.kernel.define<number>(
        semantic,
        {
          kind: "numberDiscrete",
          options: spec.options,
          min: spec.min,
          max: spec.max,
          step: spec.step,
        },
        defaultValue
      );
      return wrapOwnedHandle(h, this.sys, semantic);
    },
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.kernel.dispose();
  }
}
