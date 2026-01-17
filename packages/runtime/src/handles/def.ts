// packages/runtime/src/handles/def.ts
import type { DefHandle, RunHandle, StyleHandle } from "@proto-ui/core";
import { illegalPhase } from "../guard";
import type { RuleSpec } from "@proto-ui/rule";
import type { PropsBaseType } from "@proto-ui/types";
import { RuleRegistry } from "../rule";
import { ModuleHub } from "../module-hub/types";
import { FeedbackFacade } from "@proto-ui/module-feedback";
import { PropsFacade } from "@proto-ui/module-props";

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
      watch(keys, cb) {
        ensureSetup(`def.props.watch`);
        props.watch(keys, cb as any);
      },
      watchAll(cb) {
        ensureSetup(`def.props.watchAll`);
        props.watchAll(cb as any);
      },
      watchRaw(keys, cb) {
        ensureSetup(`def.props.watchRaw`);
        props.watchRaw(keys, cb as any);
      },
      watchRawAll(cb) {
        ensureSetup(`def.props.watchRawAll`);
        props.watchRawAll(cb as any);
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
  };
};
