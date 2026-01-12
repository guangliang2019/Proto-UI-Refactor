// packages/runtime/src/def.ts

import type {
  DefHandle,
  FeedbackStyleRecorder,
  RunHandle,
  StyleHandle,
} from "@proto-ui/core";
import { illegalPhase } from "./guard";
import type { RuleSpec } from "@proto-ui/rule";
import { PropsManager } from "@proto-ui/props";
import { RuleRegistry } from "./rule";

export type LifecycleKind = "created" | "mounted" | "updated" | "unmounted";

export interface LifecycleRegistry {
  created: Array<(run: RunHandle) => void>;
  mounted: Array<(run: RunHandle) => void>;
  updated: Array<(run: RunHandle) => void>;
  unmounted: Array<(run: RunHandle) => void>;
}

export interface DefRuntimeState {
  getPhase(): "setup" | "render" | "callback" | "unknown";
  prototypeName: string;
}

export function createLifecycleRegistry(): LifecycleRegistry {
  return { created: [], mounted: [], updated: [], unmounted: [] };
}

export function createDefHandle(
  st: DefRuntimeState,
  life: LifecycleRegistry,
  props: PropsManager,
  feedbackStyle: FeedbackStyleRecorder,
  rules: RuleRegistry
): DefHandle {
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
      define(decl) {
        ensureSetup(`def.props.define`);
        props.define(decl);
      },
      setDefaults(partial) {
        ensureSetup(`def.props.setDefaults`);
        props.setDefaults(partial);
      },
      watch(keys, cb) {
        ensureSetup(`def.props.watch`);
        props.addWatch(keys, cb as any);
      },
      watchAll(cb) {
        ensureSetup(`def.props.watchAll`);
        props.addWatchAll(cb as any);
      },
      watchRaw(keys, cb) {
        ensureSetup(`def.props.watchRaw`);
        props.addWatchRaw(keys, cb as any, true);
      },
      watchRawAll(cb) {
        ensureSetup(`def.props.watchRawAll`);
        props.addWatchRawAll(cb as any, true);
      },
    },

    context: {
      subscribe(key) {
        ensureSetup(`def.context.subscribe`);
        // placeholder: record subscription intent later
        void key;
      },
      trySubscribe(key) {
        ensureSetup(`def.context.trySubscribe`);
        void key;
      },
    },

    state: {
      define(id, options) {
        ensureSetup(`def.state.define`);
        void id;
        void options;
      },
    },

    feedback: {
      style: {
        use: (...handles: StyleHandle[]) => {
          ensureSetup(`def.feedback.style.use`);
          const unUse = feedbackStyle.use(...handles);
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
}
