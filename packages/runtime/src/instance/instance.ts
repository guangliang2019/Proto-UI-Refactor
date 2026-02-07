// packages/runtime/src/instance/instance.ts
import type { Prototype, RunHandle, TemplateChildren } from "@proto-ui/core";
import type { PropsBaseType } from "@proto-ui/types";

import { createFeedbackModule } from "@proto-ui/module-feedback";
import { createPropsModule } from "@proto-ui/module-props";
import { createEventModule } from "@proto-ui/module-event";
import { createStateModule } from "@proto-ui/module-state";
import {
  __RUN_TEST_SYS,
  createTestSysModule,
  type TestSysPort,
} from "@proto-ui/module-test-sys";

import type { ModuleHub } from "../orchestrator/module-hub";
import { RuntimeModuleHub } from "../orchestrator/module-hub";
import type { ExecPhase } from "@proto-ui/module-base";

import { CallbackScope } from "./execute/callback-scope";
import { createKernel, type Kernel } from "../kernel";
import type { RuntimeTimeline } from "./execute/timeline";

export type RuntimeInstance<P extends PropsBaseType> = {
  kernel: Kernel<P>;
  moduleHub: ModuleHub;
  callbackScope: CallbackScope<P>;

  renderOnce(): TemplateChildren;

  /**
   * Run lifecycle callbacks in callback phase (sync props + dispatch watches + ctx).
   * This is the only correct entrance for lifecycle callbacks.
   */
  runLifecycle(kind: keyof Kernel<P>["lifecycle"]): void;

  setTimeline(t: RuntimeTimeline | null): void;
  dispose(): void;
};

export function createRuntimeInstance<P extends PropsBaseType>(
  proto: Prototype<P>,
  opt?: { allowRunUpdate?: boolean }
): RuntimeInstance<P> {
  // stable phase ref for SYS_CAP.execPhase() during module setup/runtime checks
  let phaseRef: ExecPhase = "unknown";
  const getPhase = () => phaseRef;

  const moduleHub = new RuntimeModuleHub(
    { prototypeName: proto.name, getPhase },
    [
      { name: "feedback", create: createFeedbackModule },
      { name: "props", create: createPropsModule },
      { name: "event", create: createEventModule },
      { name: "state", create: createStateModule },
      { name: "test-sys", create: createTestSysModule },
    ]
  );

  const kernel = createKernel<P>(proto, moduleHub, {
    allowRunUpdate: opt?.allowRunUpdate,
    onPhaseChange: (p) => {
      phaseRef = p;
    },
  });

  // align once (after setup ends kernel is typically "unknown")
  phaseRef = kernel.getPhase() as any;

  const callbackScope = new CallbackScope<P>(
    (p) => kernel.setPhase(p as any),
    moduleHub
  );

  // add test-sys to run handle, for contract tests
  const testSys = moduleHub.getPort<TestSysPort>("test-sys");
  if (testSys) {
    Object.defineProperty(kernel.run as any, __RUN_TEST_SYS, {
      value: testSys,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  const renderOnce = () => kernel.renderOnce();

  const runLifecycle = (kind: keyof Kernel<P>["lifecycle"]) => {
    callbackScope.run(kernel.run, () => {
      for (const cb of kernel.lifecycle[kind] as Array<
        (run: RunHandle<P>) => void
      >) {
        cb(kernel.run);
      }
    });
  };

  const setTimeline = (t: RuntimeTimeline | null) => {
    kernel.setTimeline(t);
  };

  const dispose = () => {
    moduleHub.dispose();
  };

  return {
    kernel,
    moduleHub,
    callbackScope,
    renderOnce,
    runLifecycle,
    setTimeline,
    dispose,
  };
}
