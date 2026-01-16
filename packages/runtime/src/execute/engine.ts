import {
  createRendererPrimitives,
  FeedbackStyleRecorder,
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
  LifecycleRegistry,
} from "../def";
import { PropsManager } from "@proto-ui/props";
import { RuleRegistry } from "../rule";
import { ModuleHub, RuntimeModuleHub } from "../module-hub";
import { createFeedbackModule } from "@proto-ui/module-feedback";

export type Engine<P extends PropsBaseType> = {
  // state
  getPhase(): Phase;
  setPhase(p: Phase): void;

  // runtime resources
  lifecycle: LifecycleRegistry<P>;
  propsMgr: PropsManager<P>;
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
  opt?: { initialRawProps?: Record<string, any>; allowRunUpdate?: boolean }
): Engine<P> {
  let phase: Phase = "unknown";

  const st = {
    prototypeName: proto.name,
    getPhase: () => phase as any,
  };

  const lifecycle = createLifecycleRegistry<P>();

  const propsMgr = new PropsManager<P>();

  const rules = new RuleRegistry();

  const moduleHub = new RuntimeModuleHub({ prototypeName: proto.name }, [
    { name: "feedback", create: createFeedbackModule },
  ]);

  const def = createDefHandle(st, lifecycle, propsMgr, rules, moduleHub);

  // setup
  phase = "setup";
  const maybeRender = proto.setup(def);

  const renderFn: RenderFn = maybeRender ?? ((renderer) => [renderer.r.slot()]);

  // init props (before any callbacks)
  propsMgr.applyRaw({ ...((opt?.initialRawProps ?? {}) as any) });

  // controller is host-level concept; in pure engine run.update is gated
  let runUpdateImpl: (() => void) | undefined = undefined;
  if (opt?.allowRunUpdate) {
    // will be assigned by executeWithHost
    runUpdateImpl = () => {
      throw new Error(`[Runtime] run.update() is not wired yet.`);
    };
  }

  const run: RunHandle<P> = {
    update: () => {
      if (!runUpdateImpl) {
        throw new Error(
          `[Runtime] run.update() is not supported in host-free execution.`
        );
      }
      runUpdateImpl();
    },
    props: {
      get: () => propsMgr.get(),
      getRaw: () => propsMgr.getRaw(),
      isProvided: (k: string) => propsMgr.isProvided(k),
    },
  };

  const read: RenderReadHandle<P> = {
    props: run.props,
  };

  const { el, r } = createRendererPrimitives();
  const renderer: RendererHandle<P> = { el, r, read };

  const renderOnce = () => {
    phase = "render";
    const children = renderFn(renderer);
    phase = "unknown";
    return children;
  };

  const invoke = (kind: keyof LifecycleRegistry<P>) => {
    phase = "callback";
    for (const cb of lifecycle[kind]) cb(run);
    phase = "unknown";

    if (kind === "unmounted") {
      propsMgr.dispose();
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
    propsMgr,
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
