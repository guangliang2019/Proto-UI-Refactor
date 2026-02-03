import {
  createRendererPrimitives,
  Phase,
  Prototype,
  RendererHandle,
  RenderFn,
  RenderReadHandle,
  RunHandle,
  TemplateChildren,
} from "@proto-ui/core";
import { PropsBaseType } from "@proto-ui/types";
import {
  createDefHandle,
  createLifecycleRegistry,
  createRunHandle,
  LifecycleRegistry,
} from "../handles";
import { RuleRegistry } from "../rule";
import { ModuleHub, RuntimeModuleHub } from "../module-hub";
import { createFeedbackModule } from "@proto-ui/module-feedback";
import {
  createPropsModule,
  type PropsFacade,
  type PropsPort,
  type PropsWatchTask,
} from "@proto-ui/module-props";

import { RuntimeTimeline } from "./timeline";
import { createEventModule } from "@proto-ui/module-event";
import { createStateModule } from "@proto-ui/module-state";
import { ExecPhase } from "@proto-ui/module-base";
import {
  __RUN_TEST_SYS,
  createTestSysModule,
  type TestSysPort,
} from "@proto-ui/module-test-sys";

export type Engine<P extends PropsBaseType> = {
  getPhase(): Phase;
  setPhase(p: Phase): void;

  lifecycle: LifecycleRegistry<P>;
  rules: RuleRegistry;
  moduleHub: ModuleHub;

  run: RunHandle<P>;
  read: RenderReadHandle<P>;
  renderer: RendererHandle<P>;
  renderFn: RenderFn;

  renderOnce(): TemplateChildren;
  invoke(kind: keyof LifecycleRegistry<P>): void;

  setTimeline(cp: RuntimeTimeline | null): void;
};

export function createEngine<P extends PropsBaseType>(
  proto: Prototype<P>,
  opt?: { allowRunUpdate?: boolean }
): Engine<P> {
  let phase: ExecPhase = "unknown";
  let timeline: RuntimeTimeline | null = null;

  const st = {
    prototypeName: proto.name,
    getPhase: () => phase,
  };

  const lifecycle = createLifecycleRegistry<P>();
  const rules = new RuleRegistry();

  const moduleHub = new RuntimeModuleHub(
    { prototypeName: proto.name, getPhase: () => phase },
    [
      { name: "feedback", create: createFeedbackModule },
      { name: "props", create: createPropsModule },
      { name: "event", create: createEventModule },
      { name: "state", create: createStateModule },
      { name: "test-sys", create: createTestSysModule },
    ]
  );

  const def = createDefHandle<P>(st, lifecycle, rules, moduleHub);

  phase = "setup";
  const maybeRender = proto.setup(def);
  const renderFn: RenderFn = maybeRender ?? ((renderer) => [renderer.r.slot()]);
  phase = "unknown";

  let runUpdateImpl: (() => void) | undefined = undefined;
  if (opt?.allowRunUpdate) {
    runUpdateImpl = () => {
      throw new Error(`[Runtime] run.update() is not wired yet.`);
    };
  }

  const run = createRunHandle<P>(() => {
    if (!runUpdateImpl) {
      throw new Error(
        `[Runtime] run.update() is not supported in host-free execution.`
      );
    }
    runUpdateImpl();
  }, moduleHub);

  // add test-sys to run handle, for contract tests
  const testSys = moduleHub.getPort<TestSysPort>("test-sys");
  if (testSys) {
    Object.defineProperty(run as any, __RUN_TEST_SYS, {
      value: testSys,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  const facades = moduleHub.getFacades();
  const propsFacade = facades["props"] as PropsFacade<P>;

  const read: RenderReadHandle<P> = {
    props: propsFacade as any,
  };

  const { el, r } = createRendererPrimitives();
  const renderer: RendererHandle<P> = { el, r, read };

  const dispatchPropsTasks = () => {
    const propsPort = moduleHub.getPort<PropsPort<P>>("props");
    const tasks = propsPort?.consumeTasks() ?? [];
    for (const t of tasks as PropsWatchTask<P>[]) {
      // ctx is run; module does not know what ctx is
      if (t.kind === "resolved")
        t.cb(run as any, t.next as any, t.prev as any, t.info as any);
      else t.cb(run as any, t.next as any, t.prev as any, t.info as any);
    }
  };

  const renderOnce = () => {
    const propsPort = moduleHub.getPort<PropsPort<P>>("props");
    propsPort?.syncFromHost();

    phase = "render";
    const children = renderFn(renderer);
    phase = "unknown";

    timeline?.mark("tree:logical-ready");
    return children;
  };

  const invoke = (kind: keyof LifecycleRegistry<P>) => {
    const propsPort = moduleHub.getPort<PropsPort<P>>("props");

    phase = "callback";

    // set callback ctx for modules via SYS_CAP.getCallbackCtx()
    (moduleHub as any).__setCallbackCtx?.(run);

    try {
      // before callbacks, pull latest raw then dispatch watches
      propsPort?.syncFromHost();
      dispatchPropsTasks();

      for (const cb of lifecycle[kind]) cb(run);
    } finally {
      // clear ctx to avoid accidental leakage
      (moduleHub as any).__setCallbackCtx?.(undefined);
      phase = "unknown";
    }
  };

  return {
    getPhase: () => phase,
    setPhase: (p) => {
      phase = p;
    },
    lifecycle,
    rules,
    moduleHub,
    run,
    read,
    renderer,
    renderFn,
    renderOnce,
    invoke,
    setTimeline: (t) => {
      timeline = t;
    },
  };
}
