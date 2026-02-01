// packages/module-state/src/impl.ts
import type { OwnedStateHandle } from "@proto-ui/core";
import type { SystemCaps } from "@proto-ui/module-base";
import type { StateSetReason } from "@proto-ui/types";

import { StateKernel } from "./kernel";
import type { StateFacade } from "./types";

function opOf(semantic: string, method: string) {
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
      sys.ensureSetup(opOf(semantic, "setDefault"));
      return raw.setDefault(v);
    },

    set: (v, reason?: StateSetReason) => {
      sys.ensureCallback(opOf(semantic, "set"));
      return raw.set(v, reason);
    },
  };

  (wrapped as any).__stateId = (raw as any).__stateId;
  (wrapped as any).__stateSemantic = (raw as any).__stateSemantic ?? semantic;
  (wrapped as any).__stateKind = (raw as any).__stateKind;

  return wrapped;
}

export class StateModuleImpl {
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
          kind: "number.range",
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
          kind: "number.discrete",
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
