// packages/module-expose-state-web/src/impl.ts
import type { CapsVaultView, ProtoPhase } from "@proto-ui/core";
import { ModuleBase } from "@proto-ui/module-base";
import type { ModuleDeps } from "@proto-ui/module-base";
import type { StateSpec } from "@proto-ui/types";

import type { ExposeStatePort } from "@proto-ui/module-expose-state";
import type { ExposeStateExternalHandle } from "@proto-ui/module-expose-state";

import {
  EXPOSE_STATE_WEB_MAP_CAP,
  EXPOSE_STATE_WEB_MODE_CAP,
  HOST_ELEMENT_CAP,
  type ExposeStateWebMode,
  type ExposeStateWebNameMap,
} from "./caps";

type Binding = {
  key: string;
  off?: () => void;
  attr?: string;
  cssVar?: string;
  kind?: StateSpec["kind"];
};

function defaultNameMap(semantic: string) {
  const base = semantic
    .trim()
    .replace(/\s+/g, "-")
    .replace(/\./g, "-")
    .replace(/[^a-zA-Z0-9\-]/g, "-")
    .toLowerCase();
  return {
    dataAttr: `data-${base}`,
    cssVar: `--pui-${base}`,
  };
}

function isExternalStateHandle(x: any): x is ExposeStateExternalHandle<any> {
  return (
    !!x &&
    typeof x === "object" &&
    typeof x.get === "function" &&
    typeof x.subscribe === "function" &&
    typeof x.unsubscribe === "function" &&
    !!x.spec
  );
}

export class ExposeStateWebModuleImpl extends ModuleBase {
  private readonly exposeState: ExposeStatePort;
  private disposed = false;

  private bindings: Binding[] = [];

  constructor(caps: CapsVaultView, deps: ModuleDeps) {
    super(caps);
    this.exposeState = deps.requirePort<ExposeStatePort>("expose-state");
  }

  override onProtoPhase(phase: ProtoPhase): void {
    super.onProtoPhase(phase);
    if (phase === "unmounted") this.dispose();
  }

  override afterRenderCommit(): void {
    this.refresh();
  }

  protected override onCapsEpoch(_epoch: number): void {
    this.refresh();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearBindings();
  }

  // -------------------------
  // core
  // -------------------------

  private refresh(): void {
    if (this.disposed) return;

    if (!this.caps.has(HOST_ELEMENT_CAP)) return;
    const host = this.caps.get(HOST_ELEMENT_CAP);
    if (!host) return;

    const nameMap = this.caps.has(EXPOSE_STATE_WEB_MAP_CAP)
      ? this.caps.get(EXPOSE_STATE_WEB_MAP_CAP)
      : defaultNameMap;

    const mode: ExposeStateWebMode = this.caps.has(EXPOSE_STATE_WEB_MODE_CAP)
      ? this.caps.get(EXPOSE_STATE_WEB_MODE_CAP)
      : {};

    const all = this.exposeState.getAll();

    this.clearBindings();

    for (const [key, value] of Object.entries(all)) {
      if (!isExternalStateHandle(value)) continue;

      const spec = value.spec as StateSpec;
      const semantic = (value as any).__stateSemantic || key;
      const mapping = nameMap(semantic);

      const binding: Binding = {
        key,
        kind: spec.kind,
        attr: mapping.dataAttr,
        cssVar: mapping.cssVar,
      };

      this.applySnapshot(host, value, binding, mode);

      const off = value.subscribe((e) => {
        if (e.type === "disconnect") return;
        this.applyValue(host, e.next as any, binding, mode);
      });

      binding.off = () => value.unsubscribe(off);
      this.bindings.push(binding);
    }
  }

  private applySnapshot(
    host: HTMLElement,
    h: ExposeStateExternalHandle<any>,
    binding: Binding,
    mode: ExposeStateWebMode
  ) {
    const v = h.get();
    this.applyValue(host, v, binding, mode);
  }

  private applyValue(
    host: HTMLElement,
    v: any,
    binding: Binding,
    mode: ExposeStateWebMode
  ) {
    const kind = binding.kind;
    if (!kind) return;

    const attr = binding.attr;
    const cssVar = binding.cssVar;

    const setAttr = (val: string | null) => {
      if (!attr) return;
      if (val === null) host.removeAttribute(attr);
      else host.setAttribute(attr, val);
    };

    const setVar = (val: string | null) => {
      if (!cssVar) return;
      if (val === null) host.style.removeProperty(cssVar);
      else host.style.setProperty(cssVar, val);
    };

    switch (kind) {
      case "bool": {
        if (v) setAttr("");
        else setAttr(null);
        // no css var by default
        break;
      }
      case "enum":
      case "string": {
        const value = v == null ? "" : String(v);
        setAttr(value);
        if (mode.allowStringVar) setVar(value);
        break;
      }
      case "number.discrete": {
        const value = v == null ? "" : String(v);
        setAttr(value);
        setVar(value);
        break;
      }
      case "number.range": {
        const value = v == null ? "" : String(v);
        if (mode.allowContinuousAttr) setAttr(value);
        setVar(value);
        break;
      }
      default: {
        // fallback: no-op
        break;
      }
    }
  }

  private clearBindings(): void {
    for (const b of this.bindings) {
      try {
        b.off?.();
      } catch {}
    }
    this.bindings = [];
  }
}
