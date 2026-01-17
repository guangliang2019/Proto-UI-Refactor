// packages/runtime/src/execute/engine.ts
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
} from "@proto-ui/module-props";

export type Engine<P extends PropsBaseType> = {
  // state
  getPhase(): Phase;
  setPhase(p: Phase): void;

  // runtime resources
  lifecycle: LifecycleRegistry<P>;
  rules: RuleRegistry;

  // modules
  moduleHub: ModuleHub;

  // handles & renderer
  run: RunHandle<P>;
  read: RenderReadHandle<P>;
  renderer: RendererHandle<P>;
  renderFn: RenderFn;

  // helpers
  renderOnce(): TemplateChildren;
  invoke(kind: keyof LifecycleRegistry<P>): void;
};

export function createEngine<P extends PropsBaseType>(
  proto: Prototype<P>,
  opt?: { allowRunUpdate?: boolean }
): Engine<P> {
  let phase: Phase = "unknown";

  const st = {
    prototypeName: proto.name,
    getPhase: () => phase as any,
  };

  const lifecycle = createLifecycleRegistry<P>();
  const rules = new RuleRegistry();

  const moduleHub = new RuntimeModuleHub({ prototypeName: proto.name }, [
    { name: "feedback", create: createFeedbackModule },
    { name: "props", create: createPropsModule },
  ]);

  const def = createDefHandle<P>(st, lifecycle, rules, moduleHub);

  // setup
  phase = "setup";
  const maybeRender = proto.setup(def);
  const renderFn: RenderFn = maybeRender ?? ((renderer) => [renderer.r.slot()]);

  // controller is host-level concept; in pure engine run.update is gated
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

  // props facade for read handle
  const facades = moduleHub.getFacades();
  const propsFacade = facades["props"] as PropsFacade<P>;

  const read: RenderReadHandle<P> = {
    props: propsFacade as any, // because RenderReadHandle expects RunHandle["props"]-shape
  };

  const { el, r } = createRendererPrimitives();
  const renderer: RendererHandle<P> = { el, r, read };

  const renderOnce = () => {
    // before render, pull latest raw if host has any dirty changes
    const propsPort = moduleHub.getPort<PropsPort<P>>("props");
    propsPort?.syncFromHost();

    phase = "render";
    const children = renderFn(renderer);
    phase = "unknown";
    return children;
  };

  const invoke = (kind: keyof LifecycleRegistry<P>) => {
    const propsPort = moduleHub.getPort<PropsPort<P>>("props");

    phase = "callback";

    // before callbacks, pull latest raw so watches can run on “no update” paths
    propsPort?.syncFromHost(run);

    for (const cb of lifecycle[kind]) cb(run);
    phase = "unknown";

    if (kind === "unmounted") {
      moduleHub.setProtoPhase("unmounted");
      moduleHub.dispose();
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
  };
}
