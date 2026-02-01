// packages/module-event/test/impl-spec.test.ts
import { describe, it, expect } from "vitest";
import { EventModuleImpl } from "../src/impl";
import { FakeEventTarget } from "./utils/fake-event-target";
import { makeCaps, createSysCaps } from "./utils/fake-caps";

describe("EventModuleImpl", () => {
  it("setup-only: calling on after setup throws", () => {
    const root = new FakeEventTarget();
    const sys = createSysCaps();

    const caps = makeCaps({
      sys,
      getRootTarget: () => root as any,
      getGlobalTarget: () => root as any,
    });

    const impl = new EventModuleImpl(caps, "p-x");

    // leave setup exec-phase
    sys.__setExecPhase("render");

    expect(() => impl.on("press.commit" as any, (() => {}) as any)).toThrow();
  });

  it("bind(): requires root target", () => {
    const sys = createSysCaps();
    const caps = makeCaps({
      sys,
      getRootTarget: () => null,
      getGlobalTarget: () => null,
    });

    const impl = new EventModuleImpl(caps, "p-x");

    // setup: registrations allowed
    sys.__setExecPhase("setup");
    impl.on("press.commit" as any, (() => {}) as any);

    // runtime: bind requires root target
    sys.__setExecPhase("render");
    expect(() => impl.bind({} as any)).toThrowError(/root target unavailable/i);
  });

  it("bind(): requires global target only if there is global registration", () => {
    const root = new FakeEventTarget();
    const sysA = createSysCaps();

    const capsNoGlobal = makeCaps({
      sys: sysA,
      getRootTarget: () => root as any,
      getGlobalTarget: () => null,
    });

    // Case A: no global regs => bind ok
    const a = new EventModuleImpl(capsNoGlobal, "p-a");
    sysA.__setExecPhase("setup");
    a.on("press.commit" as any, (() => {}) as any);

    sysA.__setExecPhase("render");
    expect(() => a.bind({} as any)).not.toThrow();

    // Case B: has global regs => bind must throw (missing global target)
    const sysB = createSysCaps();
    const capsNoGlobalB = makeCaps({
      sys: sysB,
      getRootTarget: () => root as any,
      getGlobalTarget: () => null,
    });

    const b = new EventModuleImpl(capsNoGlobalB, "p-b");
    sysB.__setExecPhase("setup");
    b.onGlobal("key.down" as any, (() => {}) as any);

    sysB.__setExecPhase("render");
    expect(() => b.bind({} as any)).toThrowError(/global target unavailable/i);
  });

  it("unmounted phase triggers cleanupAll()", () => {
    const root = new FakeEventTarget();
    const sys = createSysCaps();

    const caps = makeCaps({
      sys,
      getRootTarget: () => root as any,
      getGlobalTarget: () => root as any,
    });

    const impl = new EventModuleImpl(caps, "p-x");

    sys.__setExecPhase("setup");
    impl.on("press.commit" as any, (() => {}) as any);

    sys.__setExecPhase("render");
    impl.bind({} as any);

    expect(root.count("press.commit")).toBe(1);

    impl.onProtoPhase("unmounted" as any);

    // after unmounted cleanup, it must be detached
    expect(root.count("press.commit")).toBe(0);

    // should not throw if called again (idempotency is nice but not required)
    expect(() => impl.unbind()).not.toThrow();
  });

  it("caps epoch change while bound triggers rebind", () => {
    const root1 = new FakeEventTarget();
    const root2 = new FakeEventTarget();
    const sys = createSysCaps();

    let current: any = root1;

    const caps = makeCaps({
      sys,
      getRootTarget: () => current as any,
      getGlobalTarget: () => current as any,
    });

    const impl = new EventModuleImpl(caps, "p-x");

    sys.__setExecPhase("setup");
    impl.on("press.commit" as any, (() => {}) as any);

    sys.__setExecPhase("render");
    impl.bind({} as any);

    expect(root1.count("press.commit")).toBe(1);
    expect(root2.count("press.commit")).toBe(0);

    // switch targets and simulate caps epoch change
    current = root2;
    (caps as any).__set("getRootTarget", () => current as any);
    (caps as any).__set("getGlobalTarget", () => current as any);
    (caps as any).__bumpEpoch();

    expect(root1.count("press.commit")).toBe(0);
    expect(root2.count("press.commit")).toBe(1);
  });

  it("token.desc() stores label (dev semantics aside)", () => {
    const root = new FakeEventTarget();
    const sys = createSysCaps();

    const caps = makeCaps({
      sys,
      getRootTarget: () => root as any,
      getGlobalTarget: () => root as any,
    });

    const impl = new EventModuleImpl(caps, "p-x");

    sys.__setExecPhase("setup");
    const t = impl.on("press.commit" as any, (() => {}) as any);
    t.desc("asButton: commit");

    const diags = impl.getDiagnostics();
    expect(diags[0].label).toBe("asButton: commit");
  });
});
