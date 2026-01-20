// packages/runtime/src/execute/with-host.ts
import { Prototype } from "@proto-ui/core";
import { PropsBaseType } from "@proto-ui/types";
import { RuntimeHost } from "../host";
import { ExecuteWithHostResult, RuntimeController } from "./types";
import { createEngine } from "./engine";
import type { PropsFacade, PropsPort } from "@proto-ui/module-props";
import { createTimeline } from "./timeline";

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

  // initial props hydration (before any callbacks + before initial render)
  propsPort.applyRaw({ ...(host.getRawProps?.() ?? {}) }, run);

  // CP1: host:ready
  // Host is now bound and host-facing resources are usable (caps wiring may happen here or after).
  // (In v0, we place this after initial raw hydration to make props available to created callbacks.)
  timeline.mark("host:ready");

  // adapter wiring hook (caps injection must happen here)
  host.onRuntimeReady?.(moduleHub);

  const doRenderCommit = (kind: "initial" | "update") => {
    // pull latest raw before rendering (covers rawPropsSource changes not going through applyProps)
    propsPort.syncFromHost(run);

    // CP2: tree:logical-ready
    // renderOnce() is responsible for marking "tree:logical-ready" (CP2) internally.
    const children = engine.renderOnce();

    // CP3: commit:done
    host.commit(children);
    timeline.mark("commit:done");

    // v0: instance reachability gate (CP4)
    // WC may map CP4 ~= CP3. Framework adapters may delay CP4 in the future.
    // This mark is the canonical "events may become effective from now on" boundary.
    timeline.mark("instance:reachable");

    // afterRenderCommit hook for modules
    moduleHub.afterRenderCommit();
    timeline.mark("afterRenderCommit");

    if (kind === "update") {
      moduleHub.setProtoPhase("updated");

      engine.setPhase("callback");
      // callbacks should see synced props already; but sync again is cheap & deterministic
      propsPort.syncFromHost(run);
      for (const cb of lifecycle.updated) cb(run);
      engine.setPhase("unknown");
    }

    return children;
  };

  let controller!: RuntimeController;

  controller = {
    applyRawProps(nextRaw) {
      // IMPORTANT:
      // - this must trigger watches
      // - but must NOT render/commit
      propsPort.applyRaw({ ...(nextRaw ?? {}) }, run);
    },
    update() {
      doRenderCommit("update");
    },
    getRuleStyleTokens() {
      // style token evaluation must see latest resolved props,
      // so sync once here too (covers rare “raw changed outside applyProps” cases)
      propsPort.syncFromHost(run);
      const current = propsFacade.get();
      return rules.evaluateStyleTokens(current);
    },
  };

  // wire run.update now that controller exists
  (run as any).update = () => controller.update();

  // created callbacks: once, before first commit
  engine.setPhase("callback");
  propsPort.syncFromHost(run);
  for (const cb of lifecycle.created) cb(run);
  engine.setPhase("unknown");

  // initial commit
  const children = doRenderCommit("initial");

  // commit done => module phase enters mounted synchronously
  moduleHub.setProtoPhase("mounted");
  timeline.mark("proto:mounted");

  let ended = false;

  host.schedule(() => {
    if (ended) return; // crucial: unmounted/disposed => skip mounted callbacks and skip timeline mark

    timeline.mark("mounted:callbacks");

    engine.setPhase("callback");
    propsPort.syncFromHost(run);
    for (const cb of lifecycle.mounted) cb(run);
    engine.setPhase("unknown");
  });

  const invokeUnmounted = () => {
    if (ended) return; // optional idempotency guard
    ended = true;

    timeline.mark("unmount:begin");
    host.onUnmountBegin?.();

    engine.setPhase("callback");
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
