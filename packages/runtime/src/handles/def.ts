// packages/runtime/src/handles/def.ts
import type { DefHandle, RunHandle, StyleHandle } from "@proto-ui/core";
import { illegalPhase } from "../guard";
import type { RuleSpec } from "@proto-ui/rule";
import type { PropsBaseType } from "@proto-ui/types";
import { RuleRegistry } from "../rule";
import { ModuleHub } from "../module-hub/types";
import type { FeedbackFacade } from "@proto-ui/module-feedback";
import type { PropsFacade } from "@proto-ui/module-props";
import type { EventFacade } from "@proto-ui/module-event";
import type { StateFacade } from "@proto-ui/module-state";

export type LifecycleKind = "created" | "mounted" | "updated" | "unmounted";

export interface LifecycleRegistry<P extends PropsBaseType> {
  created: Array<(run: RunHandle<P>) => void>;
  mounted: Array<(run: RunHandle<P>) => void>;
  updated: Array<(run: RunHandle<P>) => void>;
  unmounted: Array<(run: RunHandle<P>) => void>;
}

export interface DefRuntimeState {
  getPhase(): "setup" | "render" | "callback" | "unknown";
  prototypeName: string;
}

export function createLifecycleRegistry<
  P extends PropsBaseType
>(): LifecycleRegistry<P> {
  return { created: [], mounted: [], updated: [], unmounted: [] };
}

export const createDefHandle = <P extends PropsBaseType>(
  st: DefRuntimeState,
  life: LifecycleRegistry<P>,
  rules: RuleRegistry,
  modules: ModuleHub
): DefHandle<P> => {
  const facades = modules.getFacades();
  const feedback = facades["feedback"] as FeedbackFacade;
  const props = facades["props"] as PropsFacade<P>;

  const state = facades["state"] as StateFacade;

  const eventMod = facades["event"] as any; // module-event facade (new, cb-less)
  const eventRegistry = new EventRuntimeRegistry<P>();

  // expose to executeWithHost
  (modules as any)[__RT_EVENT_REGISTRY] = eventRegistry;

  const ensureSetup = (op: string) => {
    const phase = st.getPhase();
    if (phase !== "setup") {
      illegalPhase(
        op,
        st.prototypeName,
        phase,
        `Use 'run' inside runtime callbacks, not 'def'.`
      );
    }
  };

  return {
    lifecycle: {
      onCreated(cb) {
        ensureSetup(`def.lifecycle.onCreated`);
        life.created.push(cb);
      },
      onMounted(cb) {
        ensureSetup(`def.lifecycle.onMounted`);
        life.mounted.push(cb);
      },
      onUpdated(cb) {
        ensureSetup(`def.lifecycle.onUpdated`);
        life.updated.push(cb);
      },
      onUnmounted(cb) {
        ensureSetup(`def.lifecycle.onUnmounted`);
        life.unmounted.push(cb);
      },
    },

    props: {
      define(specMap) {
        ensureSetup(`def.props.define`);
        props.define(specMap);
      },
      setDefaults(partial) {
        ensureSetup(`def.props.setDefaults`);
        props.setDefaults(partial);
      },

      // Wrap user callback so module-props does NOT depend on RunHandle type.
      watch(keys, cb) {
        ensureSetup(`def.props.watch`);
        props.watch(keys as any, (ctx, next, prev, info) =>
          (cb as any)(ctx as RunHandle<P>, next, prev, info)
        );
      },
      watchAll(cb) {
        ensureSetup(`def.props.watchAll`);
        props.watchAll((ctx, next, prev, info) =>
          (cb as any)(ctx as RunHandle<P>, next, prev, info)
        );
      },
      watchRaw(keys, cb) {
        ensureSetup(`def.props.watchRaw`);
        props.watchRaw(keys as any, (ctx, next, prev, info) =>
          (cb as any)(ctx as RunHandle<P>, next, prev, info)
        );
      },
      watchRawAll(cb) {
        ensureSetup(`def.props.watchRawAll`);
        props.watchRawAll((ctx, next, prev, info) =>
          (cb as any)(ctx as RunHandle<P>, next, prev, info)
        );
      },
    },

    feedback: {
      style: {
        use: (...handles: StyleHandle[]) => {
          ensureSetup(`def.feedback.style.use`);
          const unUse = feedback.style.use(...handles);
          return () => {
            ensureSetup(`def.feedback.style.use:unUse`);
            unUse();
          };
        },
      },
    },

    rule: (spec: RuleSpec<any>) => {
      ensureSetup("def.rule");
      rules.define(spec as any);
    },

    event: {
      on: (type, cb, options) => {
        ensureSetup(`def.event.on`);
        // module-event: on(type, options) -> token
        const token = eventMod.on(type, options);
        eventRegistry.register("root", type, cb, options, (token as any).id);
        return token;
      },

      off: (type, cb, options) => {
        ensureSetup(`def.event.off`);
        const hit = eventRegistry.findLatest("root", type, cb, options);
        if (!hit) return;

        eventRegistry.removeById(hit.id);
        // call module-event precise removal
        eventMod.offToken({ id: hit.id } as any);
      },

      onGlobal: (type, cb, options) => {
        ensureSetup(`def.event.onGlobal`);
        const token = eventMod.onGlobal(type, options);
        eventRegistry.register("global", type, cb, options, (token as any).id);
        return token;
      },

      offGlobal: (type, cb, options) => {
        ensureSetup(`def.event.offGlobal`);
        const hit = eventRegistry.findLatest("global", type, cb, options);
        if (!hit) return;

        eventRegistry.removeById(hit.id);
        eventMod.offToken({ id: hit.id } as any);
      },

      offToken: (token) => {
        ensureSetup(`def.event.offToken`);
        const id = (token as any)?.id;
        if (typeof id === "string" && id) {
          eventRegistry.removeById(id);
        }
        eventMod.offToken(token);
      },
    },

    state: {
      bool(semantic, defaultValue) {
        ensureSetup("def.state.bool");
        return state.bool(semantic, defaultValue);
      },
      enum(semantic, defaultValue, spec) {
        ensureSetup("def.state.enum");
        return state.enum(semantic, defaultValue, spec);
      },
      string(semantic, defaultValue, spec) {
        ensureSetup("def.state.string");
        return state.string(semantic, defaultValue, spec);
      },
      numberRange(semantic, defaultValue, spec) {
        ensureSetup("def.state.numberRange");
        return state.numberRange(semantic, defaultValue, spec);
      },
      numberDiscrete(semantic, defaultValue, spec) {
        ensureSetup("def.state.numberDiscrete");
        return state.numberDiscrete(semantic, defaultValue, spec);
      },
    },
  };
};

// runtime-private hook for executeWithHost to access event registry
export const __RT_EVENT_REGISTRY = Symbol.for("__rt_event_registry");

type TargetKind = "root" | "global";

type EventReg<P extends PropsBaseType> = {
  id: string;
  kind: TargetKind;
  type: any;
  cb: (run: RunHandle<P>, ev: any) => void;
  options?: any;
};

function isPlainObject(x: any): x is Record<string, any> {
  return (
    !!x &&
    typeof x === "object" &&
    (x.constructor === Object || x.constructor == null)
  );
}

// must align with contract v0 semantics (shallow compare for plain objects)
function sameOptions(a: any, b: any) {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!Object.is(a[k], b[k])) return false;
    }
    return true;
  }

  return false;
}

class EventRuntimeRegistry<P extends PropsBaseType> {
  // preserve insertion order for latest-first removal
  private regs: EventReg<P>[] = [];

  register(kind: TargetKind, type: any, cb: any, options: any, id: string) {
    this.regs.push({ id, kind, type, cb, options });
  }

  // latest-first find by (kind,type,cb,options)
  findLatest(
    kind: TargetKind,
    type: any,
    cb: any,
    options: any
  ): EventReg<P> | null {
    for (let i = this.regs.length - 1; i >= 0; i--) {
      const r = this.regs[i]!;
      if (r.kind !== kind) continue;
      if (r.type !== type) continue;
      if (r.cb !== cb) continue;
      if (!sameOptions(r.options, options)) continue;
      return r;
    }
    return null;
  }

  removeById(id: string): boolean {
    for (let i = this.regs.length - 1; i >= 0; i--) {
      if (this.regs[i]!.id === id) {
        this.regs.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  dispatch(run: RunHandle<P>, id: string, ev: any) {
    // find latest; id unique within instance so any match is fine
    for (let i = this.regs.length - 1; i >= 0; i--) {
      const r = this.regs[i]!;
      if (r.id !== id) continue;
      r.cb(run, ev);
      return;
    }
    // unknown id => no-op (module may still fire after off/unmount race)
  }

  clear() {
    this.regs.length = 0;
  }
}
