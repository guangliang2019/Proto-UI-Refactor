// packages/runtime/src/kernel/kernel.ts
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
} from "./handles";
import { RuleRegistry } from "./rule";
import type { ModuleHubFacadeView } from "../orchestrator/module-hub/types";
import type { PropsFacade } from "@proto-ui/module-props";
import type { ExecPhase } from "@proto-ui/module-base";
import type { RuntimeTimeline } from "../instance/execute/timeline";

export type Kernel<P extends PropsBaseType> = {
  getPhase(): Phase;
  setPhase(p: Phase): void;

  lifecycle: LifecycleRegistry<P>;
  rules: RuleRegistry;

  run: RunHandle<P>;
  read: RenderReadHandle<P>;
  renderer: RendererHandle<P>;
  renderFn: RenderFn;

  renderOnce(): TemplateChildren;

  setTimeline(t: RuntimeTimeline | null): void;
};

export type CreateKernelOptions = {
  allowRunUpdate?: boolean;
  onPhaseChange?: (p: ExecPhase) => void;
};

export function createKernel<P extends PropsBaseType>(
  proto: Prototype<P>,
  modules: ModuleHubFacadeView,
  opt?: CreateKernelOptions
): Kernel<P> {
  let phase: ExecPhase = "unknown";
  let timeline: RuntimeTimeline | null = null;

  const setPhase = (p: ExecPhase) => {
    phase = p;
    opt?.onPhaseChange?.(p);
  };

  const st = {
    prototypeName: proto.name,
    getPhase: () => phase,
  };

  const lifecycle = createLifecycleRegistry<P>();
  const rules = new RuleRegistry();

  const def = createDefHandle<P>(st, lifecycle, rules, modules as any);

  // ----------------
  // setup
  // ----------------
  setPhase("setup");
  const maybeRender = proto.setup(def);
  const renderFn: RenderFn = maybeRender ?? ((renderer) => [renderer.r.slot()]);
  setPhase("unknown");

  // ----------------
  // run handle
  // ----------------
  let runUpdateImpl: (() => void) | undefined = undefined;
  if (opt?.allowRunUpdate) {
    runUpdateImpl = () => {
      throw new Error(`[Runtime] run.update() is not wired yet.`);
    };
  }

  // NOTE: createRunHandle needs full ModuleHub today (it reads facades only),
  // so we cast here. If you later split RunHandle creation into instance,
  // this cast can disappear.
  const run = createRunHandle<P>(() => {
    if (!runUpdateImpl) {
      throw new Error(
        `[Runtime] run.update() is not supported in host-free execution.`
      );
    }
    runUpdateImpl();
  }, modules as any);

  // ----------------
  // read / renderer
  // ----------------
  const facades = modules.getFacades();
  const propsFacade = facades["props"] as PropsFacade<P>;

  const read: RenderReadHandle<P> = {
    props: propsFacade as any,
  };

  const { el, r } = createRendererPrimitives();
  const renderer: RendererHandle<P> = { el, r, read };

  // ----------------
  // render
  // ----------------
  const renderOnce = () => {
    setPhase("render");
    const children = renderFn(renderer);
    setPhase("unknown");

    timeline?.mark("tree:logical-ready");
    return children;
  };

  return {
    getPhase: () => phase,
    setPhase: (p) => setPhase(p as any),

    lifecycle,
    rules,

    run,
    read,
    renderer,
    renderFn,

    renderOnce,

    setTimeline: (t) => {
      timeline = t;
    },
  };
}
