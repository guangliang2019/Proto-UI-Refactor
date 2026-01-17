// packages/runtime/src/execute/with-host.ts
import { Prototype } from "@proto-ui/core";
import { PropsBaseType } from "@proto-ui/types";
import { RuntimeHost } from "../host";
import { ExecuteWithHostResult, RuntimeController } from "./types";
import { createEngine } from "./engine";
import type { PropsFacade, PropsPort } from "@proto-ui/module-props";

export function executeWithHost<P extends PropsBaseType>(
  proto: Prototype<P>,
  host: RuntimeHost<P>
): ExecuteWithHostResult {
  const engine = createEngine(proto, {
    allowRunUpdate: true,
  });

  const { lifecycle, rules, moduleHub, run } = engine;

  const facades = moduleHub.getFacades();
  const propsFacade = facades["props"] as PropsFacade<P>;

  const propsPort = moduleHub.getPort<PropsPort<P>>("props");
  if (!propsPort) {
    throw new Error("props port not found");
  }

  // initial props hydration (before any callbacks + before initial render)
  propsPort.applyRaw({ ...(host.getRawProps?.() ?? {}) }, run);

  const doRenderCommit = (kind: "initial" | "update") => {
    // pull latest raw before rendering (covers rawPropsSource changes not going through applyProps)
    propsPort.syncFromHost(run);

    const children = engine.renderOnce();
    host.commit(children);

    moduleHub.afterRenderCommit();

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
      console.log("applyRawProps", nextRaw);
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

  // mounted callbacks: host-scheduled (contract)
  host.schedule(() => {
    engine.setPhase("callback");
    propsPort.syncFromHost(run);
    for (const cb of lifecycle.mounted) cb(run);
    engine.setPhase("unknown");
  });

  const invokeUnmounted = () => {
    moduleHub.setProtoPhase("unmounted");
    moduleHub.dispose();

    engine.setPhase("callback");
    for (const cb of lifecycle.unmounted) cb(run);
    engine.setPhase("unknown");
  };

  engine.setPhase("unknown");
  return { children, controller, invokeUnmounted, caps: moduleHub };
}
