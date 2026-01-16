// packages/adapter-web-component/src/adapt.ts

import type { Prototype } from "@proto-ui/core";
import type { EffectsPort, StyleHandle } from "@proto-ui/core";
import { executeWithHost, type RuntimeHost } from "@proto-ui/runtime";
import { commitChildren } from "./commit";
import { bindController, getElementProps, unbindController } from "./props";
import { SlotProjector } from "./slot-projector";
import { createOwnedTwTokenApplier } from "./feedback-style";
import { PropsBaseType } from "@proto-ui/types";

// TODO: prefer `import type { FeedbackCaps } from "@proto-ui/module-feedback";`
import type { FeedbackCaps } from "../../module-feedback/src/types";

function assertKebabCase(tag: string) {
  if (!tag.includes("-") || tag.toLowerCase() !== tag) {
    throw new Error(
      `[WC Adapter] custom element name must be kebab-case and contain '-': ${tag}`
    );
  }
}

export interface WebComponentAdapterOptions {
  shadow?: boolean;
  getProps?: (el: HTMLElement) => any;
  schedule?: (task: () => void) => void;
}

export function AdaptToWebComponent<Props extends PropsBaseType>(
  proto: Prototype<Props>,
  opt: WebComponentAdapterOptions = {}
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

      const host: RuntimeHost<Props> = {
        prototypeName: proto.name,

        getRawProps() {
          return getElementProps(thisEl) ?? getProps(thisEl) ?? {};
        },

        commit: (children) => {
          if (shadow) {
            commitChildren(thisRoot as any, children, { mode: "shadow" });
            this._slotProjector?.disconnect();
            this._slotProjector = null;
            return;
          }

          if (isSlotOnly(children)) {
            this._slotProjector?.disconnect();
            this._slotProjector = null;
            return;
          }

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

          projector.afterCommit({
            owned,
            slotStart: res.slotStart,
            slotEnd: res.slotEnd,
            projected: slotPool,
            enableMO: res.hasSlot,
          });

          if (!res.hasSlot) {
            projector.disconnect();
            this._slotProjector = null;
          }
        },

        schedule,
      };

      const res = executeWithHost(proto, host);
      const { controller, invokeUnmounted, caps } = res;

      // feedback module wiring: provide EffectsPort via caps controller
      const applier = createOwnedTwTokenApplier(thisEl);
      const effectsPort: EffectsPort = createWebEffectsPort(applier);

      const feedbackCaps = caps.getCapsController<FeedbackCaps>("feedback");
      feedbackCaps?.attach({ effects: effectsPort });

      (this as any).update = () => controller.update();

      bindController(this, controller);

      this._invokeUnmounted = () => {
        feedbackCaps?.reset();
        applier.clear();
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

// --- helpers

function isSlotOnly(children: any): boolean {
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

function createWebEffectsPort(
  applier: ReturnType<typeof createOwnedTwTokenApplier>
): EffectsPort {
  let latest: StyleHandle | null = null;
  let flushing = false;

  const flush = () => {
    if (flushing) return;
    flushing = true;
    try {
      const h = latest;
      if (!h) return;
      if (h.kind === "tw") applier.apply(h.tokens);
    } finally {
      flushing = false;
    }
  };

  return {
    queueStyle(handle) {
      latest = handle;
    },
    requestFlush() {
      flush();
    },
    flushNow() {
      flush();
    },
  };
}
