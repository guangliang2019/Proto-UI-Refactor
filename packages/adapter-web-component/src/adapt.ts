// packages/adapter-web-component/src/adapt.ts
import type { Prototype, EffectsPort, StyleHandle } from "@proto-ui/core";
import { executeWithHost, type RuntimeHost } from "@proto-ui/runtime";
import { PropsBaseType } from "@proto-ui/types";

import {
  RAW_PROPS_SOURCE_CAP,
  type RawPropsSource,
} from "@proto-ui/module-props";

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
import { EFFECTS_CAP } from "@proto-ui/module-feedback";
import {
  EVENT_GLOBAL_TARGET_CAP,
  EVENT_ROOT_TARGET_CAP,
} from "@proto-ui/module-event";
import { __RUN_TEST_SYS, type TestSysPort } from "@proto-ui/module-test-sys";

// Debug hook for contract tests / diagnostics.
// Intentionally not part of public authoring API.
// Accessed as: (el as any)[__WC_DEBUG_SYS]
export const __WC_DEBUG_SYS = Symbol.for(
  "@proto-ui/adapter-web-component/__debug_sys"
);

function assertKebabCase(tag: string) {
  if (!tag.includes("-") || tag.toLowerCase() !== tag) {
    throw new Error(
      `[WC Adapter] custom element name must be kebab-case and contain '-': ${tag}`
    );
  }
}

export interface WebComponentAdapterOptions<
  Props extends PropsBaseType = PropsBaseType
> {
  shadow?: boolean;
  getProps?: (el: HTMLElement) => Partial<Props> | null | undefined;
  schedule?: (task: () => void) => void;
}

export function AdaptToWebComponent<Props extends PropsBaseType>(
  proto: Prototype<Props>,
  opt: WebComponentAdapterOptions<Props> = {}
) {
  assertKebabCase(proto.name);

  const shadow = opt.shadow ?? false;
  const getProps = opt.getProps ?? (() => ({} as Partial<Props>));
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

        get(): Readonly<Props & PropsBaseType> {
          // attrs-first, then opt.getProps
          const p =
            getElementProps(thisEl) ??
            getProps(thisEl) ??
            ({} as Partial<Props>);

          // WC 从 DOM 取值，类型安全只能止步于边界；用 unknown 双断言把风险收口在这一处
          return p as unknown as Readonly<Props & PropsBaseType>;
        },

        subscribe(cb) {
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
          props: () => [[RAW_PROPS_SOURCE_CAP, rawPropsSource]],
          feedback: () => [[EFFECTS_CAP, effectsPort]],
          event: () => [
            [EVENT_ROOT_TARGET_CAP, () => router.rootTarget],
            [EVENT_GLOBAL_TARGET_CAP, () => router.globalTarget],
          ],
        },
      });

      const host: RuntimeHost<Props> = {
        prototypeName: proto.name,

        getRawProps(): Readonly<Props & PropsBaseType> {
          return rawPropsSource.get() as Readonly<Props & PropsBaseType>;
        },

        // CP1: runtime ready hook (called before created + before first commit)
        onRuntimeReady: (capsHub) => {
          wiring.onRuntimeReady(capsHub);

          // Debug: expose test-sys port for contract tests (best-effort).
          // If module not present, leave undefined.
          try {
            const sysPort = (capsHub as any).getPort?.("test-sys");
            (thisEl as any)[__WC_DEBUG_SYS] = sysPort;
          } catch {
            // ignore in v0
          }
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

        commit: (children, signal) => {
          if (shadow) {
            commitChildren(thisRoot as any, children, { mode: "shadow" });
            this._slotProjector?.disconnect();
            this._slotProjector = null;

            // WC profile: CP4 ~= commit done
            eventGate.enable();
            signal?.done();
            return;
          }

          if (isSlotOnly(children)) {
            this._slotProjector?.disconnect();
            this._slotProjector = null;

            // still a commit boundary; make events effective afterwards
            eventGate.enable();
            signal?.done();
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
          signal?.done();
        },

        schedule,
      };

      const res = executeWithHost(proto, host);
      const { controller, invokeUnmounted, caps: capsHub } = res;

      // expose debug trace getter (non-enumerable)
      Object.defineProperty(this as any, "__debugTestSysTrace", {
        enumerable: false,
        configurable: true,
        get: () => {
          const port = capsHub.getPort<TestSysPort>("test-sys");
          return port?.getTrace?.() ?? [];
        },
      });

      // 也可以再给一个 clear：
      Object.defineProperty(this as any, "__debugClearTestSysTrace", {
        enumerable: false,
        configurable: true,
        value: () => {
          const port = capsHub.getPort<TestSysPort>("test-sys");
          port?.clearTrace?.();
        },
      });

      // expose update for convenience (existing behavior)
      (this as any).update = () => controller.update();

      bindController(this, controller);

      // Teardown must keep caps alive until unmounted callbacks finish.
      this._invokeUnmounted = () =>
        teardown.run(() => {
          // 1) let runtime run CP8/CP9/CP10 (unmounted callbacks run BEFORE disposal)
          invokeUnmounted();

          try {
            const port = (capsHub as any).getPort?.("test-sys");
            port?.trace?.("after-unmount");
          } catch {}

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

          // clear debug hook
          try {
            delete (this as any)[__WC_DEBUG_SYS];
          } catch {}
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
