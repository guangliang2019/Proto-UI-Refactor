// packages/runtime/src/execute.ts

import type {
  Prototype,
  RenderFn,
  RendererHandle,
  RenderReadHandle,
  RunHandle,
  TemplateChildren,
} from "@proto-ui/core";

import { createRendererPrimitives } from "@proto-ui/core";
import {
  createDefHandle,
  createLifecycleRegistry,
  type LifecycleRegistry,
} from "./def";
import type { RuntimeHost } from "./host";
import { FeedbackStyleRecorder } from "@proto-ui/core";
import { PropsManager } from "@proto-ui/props";
import { RuleRegistry } from "./rule";

type Phase = "setup" | "render" | "callback" | "unknown";

export interface ExecuteOptions {
  props?: any;
  context?: Map<any, any>;
  state?: Map<any, any>;
}

export interface ExecuteResult {
  children: TemplateChildren;
  lifecycle: LifecycleRegistry;
  invoke(kind: keyof LifecycleRegistry): void;
}

export interface RuntimeController {
  applyProps(nextRaw: Record<string, any>): void; // no render
  update(): void; // render + commit

  /** v0: static feedback snapshot (setup-only) */
  getFeedbackStyleTokens(): string[];
  /** v0: evaluate rule -> style tokens (props only for now) */
  getRuleStyleTokens(): string[];
}

/**
 * Pure in-memory executor (used by internal specimens).
 * Does not commit to any host.
 */
export function executePrototype(
  proto: Prototype,
  opt: ExecuteOptions = {}
): ExecuteResult {
  let phase: Phase = "unknown";

  const st = {
    prototypeName: proto.name,
    getPhase: () => phase as any,
  };

  const lifecycle = createLifecycleRegistry();

  // ✅ create props manager for setup-only props APIs
  const propsMgr = new PropsManager();
  const feedbackStyle = new FeedbackStyleRecorder();
  const rules = new RuleRegistry();

  // ✅ pass props manager into def handle
  const def = createDefHandle(st, lifecycle, propsMgr, feedbackStyle, rules);

  // Setup
  phase = "setup";
  const maybeRender = proto.setup(def);

  const render: RenderFn =
    maybeRender ??
    ((renderer) => {
      return [renderer.r.slot()];
    });

  // ✅ init raw props before any runtime callbacks
  propsMgr.applyRaw({ ...(opt.props ?? {}) });

  // Run / Read (mock)
  const run: RunHandle = {
    update: () => {
      throw new Error(
        `[Runtime] run.update() is not supported in executePrototype().`
      );
    },
    props: {
      get: () => propsMgr.get(),
      getRaw: () => propsMgr.getRaw(),
      isProvided: (key: string) => propsMgr.isProvided(key),
    },
    context: {
      read: (key: any) => {
        if (!opt.context)
          throw new Error(`[Runtime] context map is not provided.`);
        if (!opt.context.has(key))
          throw new Error(`[Runtime] context missing key.`);
        return opt.context.get(key);
      },
      tryRead: (key: any) => (opt.context ? opt.context.get(key) : undefined),
    },
    state: {
      read: (id: any) => {
        if (!opt.state) throw new Error(`[Runtime] state map is not provided.`);
        return opt.state.get(id);
      },
    },
  };

  const read: RenderReadHandle = {
    props: run.props,
    context: run.context,
    state: run.state,
  };

  const { el, r } = createRendererPrimitives();
  const renderer: RendererHandle = { el, r, read };

  // Render
  phase = "render";
  const children = render(renderer);

  const invoke = (kind: keyof LifecycleRegistry) => {
    phase = "callback";
    for (const cb of lifecycle[kind]) cb(run);
    phase = "unknown";
    // optional: when unmounted is invoked in pure executor, dispose
    if (kind === "unmounted") propsMgr.dispose();
  };

  phase = "unknown";
  return { children, lifecycle, invoke };
}

/**
 * Host-based executor (used by adapters).
 * Runtime builds TemplateChildren then asks host to commit.
 *
 * Lifecycle semantics (v0):
 * - created: invoked once before first commit
 * - mounted: invoked once after first commit (scheduled by host)
 * - unmounted: invoked on disconnect (adapter calls invokeUnmounted)
 *
 * updated: reserved for future patch/update.
 */
export interface ExecuteWithHostResult {
  children: TemplateChildren;
  controller: RuntimeController;
  invokeUnmounted(): void;
}

export function executeWithHost(
  proto: Prototype,
  host: RuntimeHost
): ExecuteWithHostResult {
  let phase: Phase = "unknown";

  const st = { prototypeName: proto.name, getPhase: () => phase as any };
  const lifecycle = createLifecycleRegistry();
  const propsMgr = new PropsManager();
  const feedbackStyle = new FeedbackStyleRecorder();
  const rules = new RuleRegistry();

  const def = createDefHandle(st, lifecycle, propsMgr, feedbackStyle, rules);

  // setup
  phase = "setup";
  const maybeRender = proto.setup(def);

  // Freeze feedback snapshot right after setup (v0: static)
  const feedbackTokensSnapshot = feedbackStyle.export().tokens;

  const renderFn: RenderFn = maybeRender ?? ((renderer) => [renderer.r.slot()]);

  // host run/read
  const run = host.getRunHandle();
  const read = host.getRenderRead();

  // will be filled later
  let renderer: RendererHandle;

  // init props BEFORE created; hydration shouldn't trigger watches
  propsMgr.applyRaw({ ...(host.getRawProps() ?? {}) });

  // inject props getters (manager-backed)
  const propsAPI = {
    get: () => propsMgr.get(),
    getRaw: () => propsMgr.getRaw(),
    isProvided: (k: string) => propsMgr.isProvided(k),
  };
  (run as any).props = propsAPI;
  (read as any).props = propsAPI;

  const { el, r } = createRendererPrimitives();
  renderer = { el, r, read };

  let createdInvoked = false;

  const doRenderCommit = (kind: "initial" | "update") => {
    phase = "render";
    const children = renderFn(renderer);

    phase = "unknown";
    host.commit(children);

    if (kind === "update") {
      phase = "callback";
      for (const cb of lifecycle.updated) cb(run);
      phase = "unknown";
    }

    return children;
  };

  // controller
  const controller: RuntimeController = {
    applyProps(nextRaw) {
      // no render, only props update + watchers (if any)
      propsMgr.applyRaw({ ...(nextRaw ?? {}) }, run);
    },
    update() {
      // explicit render+commit
      doRenderCommit("update");
    },
    getFeedbackStyleTokens() {
      return feedbackTokensSnapshot.slice(); // defensive copy
    },
    getRuleStyleTokens() {
      // v0: evaluate on demand, props-only wiring
      // important: use resolved props, not raw
      const current = propsMgr.get();
      return rules.evaluateStyleTokens(current);
    },
  };

  // inject explicit update command into run
  (run as any).update = () => controller.update();

  // created callbacks: once, before first commit
  phase = "callback";
  for (const cb of lifecycle.created) cb(run);
  createdInvoked = true;

  // initial commit
  const children = doRenderCommit("initial");

  // mounted
  host.schedule(() => {
    phase = "callback";
    for (const cb of lifecycle.mounted) cb(run);
    phase = "unknown";
  });

  const invokeUnmounted = () => {
    phase = "callback";
    for (const cb of lifecycle.unmounted) cb(run);
    phase = "unknown";
    propsMgr.dispose();
  };

  phase = "unknown";
  return { children, controller, invokeUnmounted };
}
