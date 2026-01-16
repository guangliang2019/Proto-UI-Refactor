import { Prototype } from "@proto-ui/core";
import { PropsBaseType } from "@proto-ui/types";
import { RuntimeHost } from "../host";
import { ExecuteWithHostResult, RuntimeController } from "./types";
import { createEngine } from "./engine";

export function executeWithHost<P extends PropsBaseType>(
  proto: Prototype<P>,
  host: RuntimeHost<P>
): ExecuteWithHostResult {
  // build engine with initial raw props from host
  const engine = createEngine(proto, {
    initialRawProps: { ...(host.getRawProps?.() ?? {}) },
    allowRunUpdate: true,
  });

  const { lifecycle, propsMgr, rules, moduleHub, run } = engine;

  // host-commit wrapper
  const doRenderCommit = (kind: "initial" | "update") => {
    const children = engine.renderOnce();

    host.commit(children);

    // structural commit happened; allow modules to re-apply effects if needed
    moduleHub.afterRenderCommit();

    if (kind === "update") {
      moduleHub.setProtoPhase("updated");

      engine.setPhase("callback");
      for (const cb of lifecycle.updated) cb(run);
      engine.setPhase("unknown");
    }

    return children;
  };

  // runtime controller (hostful)
  let controller!: RuntimeController;

  controller = {
    applyProps(nextRaw) {
      propsMgr.applyRaw({ ...(nextRaw ?? {}) }, run);
    },
    update() {
      doRenderCommit("update");
    },
    getRuleStyleTokens() {
      const current = propsMgr.get();
      return rules.evaluateStyleTokens(current);
    },
  };

  // wire run.update now that controller exists
  (run as any).update = () => controller.update();

  // created callbacks: once, before first commit
  engine.setPhase("callback");
  for (const cb of lifecycle.created) cb(run);
  engine.setPhase("unknown");

  // initial commit
  const children = doRenderCommit("initial");

  // commit done => module phase enters mounted synchronously (no schedule)
  moduleHub.setProtoPhase("mounted");

  // mounted callbacks: host-scheduled (contract)
  host.schedule(() => {
    engine.setPhase("callback");
    for (const cb of lifecycle.mounted) cb(run);
    engine.setPhase("unknown");
  });

  const invokeUnmounted = () => {
    // tell modules first
    moduleHub.setProtoPhase("unmounted");
    moduleHub.dispose();

    engine.setPhase("callback");
    for (const cb of lifecycle.unmounted) cb(run);
    engine.setPhase("unknown");

    propsMgr.dispose();
  };

  engine.setPhase("unknown");
  return { children, controller, invokeUnmounted, caps: moduleHub };
}
