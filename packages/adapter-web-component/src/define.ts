// packages/adapter-web-component/src/define.ts
import type { Prototype, RenderReadHandle, RunHandle } from "@proto-ui/core";
import { executeWithHost, type RuntimeHost } from "@proto-ui/runtime";
import { commitChildren } from "./commit";
import { bindController, getElementProps, unbindController } from "./props";
import { SlotProjector } from "./slot-projector";

function assertKebabCase(tag: string) {
  if (!tag.includes("-") || tag.toLowerCase() !== tag) {
    throw new Error(
      `[WC Adapter] custom element name must be kebab-case and contain '-': ${tag}`
    );
  }
}

export interface DefineWebComponentOptions {
  shadow?: boolean;
  getProps?: (el: HTMLElement) => any;
  schedule?: (task: () => void) => void;
}

export function defineWebComponent(
  proto: Prototype,
  opt: DefineWebComponentOptions = {}
) {
  assertKebabCase(proto.name);

  const shadow = opt.shadow ?? false;
  const getProps = opt.getProps ?? (() => ({}));
  const schedule = opt.schedule ?? ((task) => queueMicrotask(task));

  class ProtoElement extends HTMLElement {
    private _mountedOnce = false;
    private _invokeUnmounted: (() => void) | null = null;
    private _root: Element | ShadowRoot;
    private _slotProjector: SlotProjector | null = null;

    constructor() {
      super();
      this._root = shadow
        ? (this.attachShadow({ mode: "open" }) as ShadowRoot)
        : this;
    }

    connectedCallback() {
      if (this._mountedOnce) return;
      this._mountedOnce = true;

      const thisEl = this;
      const thisRoot = this._root;

      const host: RuntimeHost = {
        prototypeName: proto.name,

        getRawProps() {
          return getElementProps(thisEl) ?? getProps(thisEl) ?? {};
        },

        getRenderRead(): RenderReadHandle {
          const run = this.getRunHandle();
          return { props: run.props, context: run.context, state: run.state };
        },

        getRunHandle(): RunHandle {
          return {
            update: () => controller.update(),
            props: {
              get: () => ({}),
              getRaw: () => host.getRawProps(),
              isProvided: (k: string) =>
                Object.prototype.hasOwnProperty.call(host.getRawProps(), k),
            },
            context: {
              read: (_k: any) => {
                throw new Error(
                  `[WC Adapter] context.read not implemented in v0`
                );
              },
              tryRead: (_k: any) => undefined,
            },
            state: {
              read: (_id: any) => {
                throw new Error(
                  `[WC Adapter] state.read not implemented in v0`
                );
              },
            },
          };
        },

        commit: (children) => {
          // shadow 模式走原生 <slot>，不需要 projector
          if (shadow) {
            commitChildren(thisRoot as any, children, { mode: "shadow" });
            this._slotProjector?.disconnect();
            this._slotProjector = null;
            return;
          }

          // light DOM 快路径：render 只有 slot()，直接什么都不做
          // 此时 children 就是 light children，本来就应该留在 el 上
          if (isSlotOnly(children)) {
            this._slotProjector?.disconnect();
            this._slotProjector = null;
            return;
          }

          // 需要 slot 投影能力：准备 projector
          if (!this._slotProjector)
            this._slotProjector = new SlotProjector(thisEl);
          const projector = this._slotProjector;

          const slotPool = projector.collectSlotPoolBeforeCommit();
          const owned = new WeakSet<Node>();

          const res = commitChildren(thisRoot as any, children, {
            mode: "light",
            slotPool,
            owned,
          });

          // 这个模板是否包含 slot，决定是否启用 MO
          projector.afterCommit({
            owned,
            slotStart: res.slotStart,
            slotEnd: res.slotEnd,
            projected: slotPool,
            enableMO: res.hasSlot,
          });

          // 如果模板里没 slot，projector 也没意义（用户 appendChild 不该被“移动/吞掉”）
          if (!res.hasSlot) {
            projector.disconnect();
            this._slotProjector = null;
          }
        },

        schedule,
      };

      const { controller, invokeUnmounted } = executeWithHost(proto, host);

      // expose update()
      (this as any).update = () => controller.update();

      bindController(this, controller);

      this._invokeUnmounted = () => {
        unbindController(this);
        invokeUnmounted();
      };
    }

    disconnectedCallback() {
      this._invokeUnmounted?.();
      this._invokeUnmounted = null;
    }
  }

  if (!customElements.get(proto.name)) {
    customElements.define(proto.name, ProtoElement);
  }

  return ProtoElement;
}

// helper functions

function isSlotOnly(children: any): boolean {
  // TemplateChildren: child | child[] | null
  // slot node: { type: { kind:"slot" }, ... }
  if (children == null) return false;

  const one = Array.isArray(children)
    ? children.length === 1
      ? children[0]
      : null
    : children;
  if (!one || typeof one !== "object") return false;
  const t = (one as any).type;
  return t && typeof t === "object" && t.kind === "slot";
}
