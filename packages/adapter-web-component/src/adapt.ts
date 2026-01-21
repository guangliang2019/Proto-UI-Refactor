// packages/adapter-web-component/src/adapt.ts
import type { Prototype, EffectsPort, StyleHandle } from "@proto-ui/core";
import { executeWithHost, type RuntimeHost } from "@proto-ui/runtime";
import { PropsBaseType } from "@proto-ui/types";

import type { RawPropsSource } from "@proto-ui/module-props";

import {
  createHostWiring,
  createEventGate,
  createTeardown,
} from "@proto-ui/adapter-base";

import { commitChildren } from "./commit";
import { bindController, getElementProps, unbindController } from "./props";
import { SlotProjector } from "./slot-projector";
import { createOwnedTwTokenApplier } from "./feedback-style";
import { createWebProtoEventRouter } from "./events";

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

    private _applier: ReturnType<typeof createOwnedTwTokenApplier> | null =
      null;

    constructor() {
      super();
      this._root = shadow
        ? (this.attachShadow({ mode: "open" }) as ShadowRoot)
        : this;
    }

    connectedCallback() {
      if (this._mountedOnce) return;
      this._mountedOnce = true;

      const teardown = createTeardown();
      const eventGate = createEventGate();

      const thisEl = this;
      const thisRoot = this._root;

      const router = createWebProtoEventRouter({
        rootEl: thisEl,
        globalEl: window,
        isEnabled: () => eventGate.isEnabled?.() ?? true, // 看你 eventGate API，没就自己存个 boolean
      });

      // Create applier/effectsPort BEFORE executeWithHost,
      // because we must inject them in host.onRuntimeReady (CP1).
      const applier = createOwnedTwTokenApplier(thisEl);
      this._applier = applier;

      const effectsPort: EffectsPort = createWebEffectsPort(applier);

      const rawPropsSource: RawPropsSource<Props> = {
        debugName: `${proto.name}#raw-props`,
        get() {
          // keep existing strategy: attrs first, then opt.getProps
          return (getElementProps(thisEl) ?? getProps(thisEl) ?? {}) as any;
        },
        subscribe(cb) {
          // minimal: observe attributes changes
          const mo = new MutationObserver((records) => {
            for (const r of records) {
              if (r.type === "attributes") {
                cb();
                break;
              }
            }
          });

          mo.observe(thisEl, { attributes: true });
          return () => mo.disconnect();
        },
      };

      // --- adapter-base wiring (CP1)
      const wiring = createHostWiring({
        prototypeName: proto.name,
        modules: {
          props: () => ({ rawPropsSource }),
          feedback: () => ({ effects: effectsPort }),
          event: () => ({
            getRootTarget: () => router.rootTarget,
            getGlobalTarget: () => router.globalTarget,
          }),
        },
      });

      const host: RuntimeHost<Props> = {
        prototypeName: proto.name,

        getRawProps() {
          return rawPropsSource.get();
        },

        // CP1: runtime ready hook (called before created + before first commit)
        onRuntimeReady: (capsHub) => {
          wiring.onRuntimeReady(capsHub);
        },

        // CP8: unmount begins hook (before unmounted callbacks)
        // IMPORTANT: do NOT reset caps here.
        // This hook is for "make things ineffective immediately", e.g. disconnect observers.
        onUnmountBegin: () => {
          eventGate.disable();

          // If slot projector has an active MO, disconnect it early.
          this._slotProjector?.disconnect();
          this._slotProjector = null;
        },

        commit: (children) => {
          if (shadow) {
            commitChildren(thisRoot as any, children, { mode: "shadow" });
            this._slotProjector?.disconnect();
            this._slotProjector = null;

            // WC profile: CP4 ~= commit done
            eventGate.enable();
            return;
          }

          if (isSlotOnly(children)) {
            this._slotProjector?.disconnect();
            this._slotProjector = null;

            // still a commit boundary; make events effective afterwards
            eventGate.enable();
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

          // WC profile: CP4 ~= commit done
          eventGate.enable();
        },

        schedule,
      };

      const res = executeWithHost(proto, host);
      const { controller, invokeUnmounted } = res;

      // expose update for convenience (existing behavior)
      (this as any).update = () => controller.update();

      bindController(this, controller);

      // Teardown must keep caps alive until unmounted callbacks finish.
      this._invokeUnmounted = () =>
        teardown.run(() => {
          // 1) let runtime run CP8/CP9/CP10 (unmounted callbacks run BEFORE disposal)
          invokeUnmounted();

          // 2) adapter-base cleanup (best-effort, after runtime disposal)
          // NOTE: if your createHostWiring.afterUnmount() calls controller.reset(),
          // it should swallow errors because moduleHub may already be disposed.
          wiring.afterUnmount();
          eventGate.dispose();
          router.dispose();

          // 3) then adapter local cleanup
          this._slotProjector?.disconnect();
          this._slotProjector = null;

          this._applier?.clear();
          this._applier = null;

          unbindController(this);
        });
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
