// packages/runtime/src/execute/with-host.ts
import { Prototype, RunHandle } from "@proto-ui/core";
import { PropsBaseType } from "@proto-ui/types";
import { RuntimeHost } from "../host";
import { ExecuteWithHostResult, RuntimeController } from "./types";
import { createEngine } from "./engine";
import type { PropsFacade, PropsPort } from "@proto-ui/module-props";
import { createTimeline } from "./timeline";
import { EventPort } from "@proto-ui/module-event";
import { __RT_EVENT_REGISTRY } from "../handles";

export function executeWithHost<P extends PropsBaseType>(
  proto: Prototype<P>,
  host: RuntimeHost<P>
): ExecuteWithHostResult {
  const timeline = createTimeline();

  const engine = createEngine(proto, {
    allowRunUpdate: true,
  });
  engine.setTimeline(timeline);

  const { lifecycle, rules, moduleHub, run } = engine;

  const facades = moduleHub.getFacades();
  const propsFacade = facades["props"] as PropsFacade<P>;

  const propsPort = moduleHub.getPort<PropsPort<P>>("props");
  if (!propsPort) {
    throw new Error("props port not found");
  }

  const dispatchPropsTasks = (ctx: RunHandle<P>) => {
    const tasks = propsPort.consumeTasks();
    for (const t of tasks as any[]) {
      t.cb(ctx, t.next, t.prev, t.info);
    }
  };

  // initial props hydration (before any callbacks + before initial render)
  propsPort.applyRaw({ ...(host.getRawProps?.() ?? {}) });

  timeline.mark("host:ready");

  host.onRuntimeReady?.(moduleHub);

  const doRenderCommit = (kind: "initial" | "update") => {
    // pull latest raw before rendering
    propsPort.syncFromHost();

    const children = engine.renderOnce();

    host.commit(children);
    timeline.mark("commit:done");

    timeline.mark("instance:reachable");
    const eventPort = moduleHub.getPort<EventPort>("event");
    const eventRegistry = (moduleHub as any)[__RT_EVENT_REGISTRY] as
      | { dispatch: (run: RunHandle<P>, id: string, ev: any) => void }
      | undefined;

    if (eventPort?.bind && eventRegistry) {
      const dispatch = (id: string, ev: any) => {
        // enforce callback-phase semantics centrally
        engine.setPhase("callback");
        propsPort.syncFromHost();
        dispatchPropsTasks(run);
        eventRegistry.dispatch(run, id, ev);
        engine.setPhase("unknown");
      };

      eventPort.bind(dispatch);
    }

    moduleHub.afterRenderCommit();
    timeline.mark("afterRenderCommit");

    if (kind === "update") {
      moduleHub.setProtoPhase("updated");

      engine.setPhase("callback");
      propsPort.syncFromHost();
      dispatchPropsTasks(run);
      for (const cb of lifecycle.updated) cb(run);
      engine.setPhase("unknown");
    }

    return children;
  };

  let controller!: RuntimeController;

  controller = {
    applyRawProps(nextRaw) {
      // must trigger watches but must NOT render/commit
      propsPort.applyRaw({ ...(nextRaw ?? {}) });
      engine.setPhase("callback");
      dispatchPropsTasks(run);
      engine.setPhase("unknown");
    },
    update() {
      doRenderCommit("update");
    },
    getRuleStyleTokens() {
      propsPort.syncFromHost();
      // (optional) ensure watches are observed before rule eval:
      // dispatchPropsTasks(run);

      const current = propsFacade.get();
      return rules.evaluateStyleTokens(current);
    },
  };

  (run as any).update = () => controller.update();

  // created callbacks: once, before first commit
  engine.setPhase("callback");
  propsPort.syncFromHost();
  dispatchPropsTasks(run);
  for (const cb of lifecycle.created) cb(run);
  engine.setPhase("unknown");

  // initial commit
  const children = doRenderCommit("initial");

  moduleHub.setProtoPhase("mounted");
  timeline.mark("proto:mounted");

  let ended = false;

  host.schedule(() => {
    if (ended) return;

    timeline.mark("mounted:callbacks");

    engine.setPhase("callback");
    propsPort.syncFromHost();
    dispatchPropsTasks(run);
    for (const cb of lifecycle.mounted) cb(run);
    engine.setPhase("unknown");
  });

  const invokeUnmounted = () => {
    if (ended) return;
    ended = true;

    timeline.mark("unmount:begin");
    host.onUnmountBegin?.();

    const eventPort = moduleHub.getPort<EventPort>("event");
    eventPort?.unbind?.();
    const eventRegistry = (moduleHub as any)[__RT_EVENT_REGISTRY] as
      | { clear: () => void }
      | undefined;

    eventRegistry?.clear?.();

    engine.setPhase("callback");
    // optional: sync + dispatch before unmounted callbacks
    propsPort.syncFromHost();
    dispatchPropsTasks(run);

    for (const cb of lifecycle.unmounted) cb(run);
    engine.setPhase("unknown");
    timeline.mark("unmounted:callbacks");

    moduleHub.setProtoPhase("unmounted");
    moduleHub.dispose();
    timeline.mark("dispose:done");
  };

  engine.setPhase("unknown");
  return { children, controller, invokeUnmounted, caps: moduleHub };
}
