// packages/module-event/test/impl-spec.test.ts
import { describe, it, expect } from "vitest";
import { EventModuleImpl } from "../src/impl";
import { FakeEventTarget } from "./utils/fake-event-target";
import { makeCaps } from "./utils/fake-caps";

describe("EventModuleImpl", () => {
  it("setup-only: calling on after setup throws", () => {
    const root = new FakeEventTarget();
    const caps = makeCaps({
      getRootTarget: () => root as any,
      getGlobalTarget: () => root as any,
    });

    const impl = new EventModuleImpl(caps, "p-x");

    // leave setup
    impl.onProtoPhase("mounted" as any);

    expect(() => impl.on("press.commit" as any, (() => {}) as any)).toThrow();
  });

  it("bind(): requires root target", () => {
    const caps = makeCaps({
      getRootTarget: () => null,
      getGlobalTarget: () => null,
    });

    const impl = new EventModuleImpl(caps, "p-x");

    // still in setup; registrations allowed
    impl.on("press.commit" as any, (() => {}) as any);

    expect(() => impl.bind({} as any)).toThrowError(/root target unavailable/i);
  });

  it("bind(): requires global target only if there is global registration", () => {
    const root = new FakeEventTarget();

    const capsNoGlobal = makeCaps({
      getRootTarget: () => root as any,
      getGlobalTarget: () => null,
    });

    // Case A: no global regs => bind ok
    const a = new EventModuleImpl(capsNoGlobal, "p-a");
    a.on("press.commit" as any, (() => {}) as any);
    expect(() => a.bind({} as any)).not.toThrow();

    // Case B: has global regs => bind must throw
    const b = new EventModuleImpl(capsNoGlobal, "p-b");
    b.onGlobal("key.down" as any, (() => {}) as any);
    expect(() => b.bind({} as any)).toThrowError(/global target unavailable/i);
  });

  it("unmounted phase triggers cleanupAll()", () => {
    const root = new FakeEventTarget();
    const caps = makeCaps({
      getRootTarget: () => root as any,
      getGlobalTarget: () => root as any,
    });

    const impl = new EventModuleImpl(caps, "p-x");
    impl.on("press.commit" as any, (() => {}) as any);
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

    let current = root1;

    const caps = makeCaps({
      getRootTarget: () => current as any,
      getGlobalTarget: () => current as any,
    });

    const impl = new EventModuleImpl(caps, "p-x");
    impl.on("press.commit" as any, (() => {}) as any);
    impl.bind({} as any);

    expect(root1.count("press.commit")).toBe(1);
    expect(root2.count("press.commit")).toBe(0);

    // switch targets and simulate caps epoch
    current = root2;
    (impl as any).onCapsEpoch?.(1);

    expect(root1.count("press.commit")).toBe(0);
    expect(root2.count("press.commit")).toBe(1);
  });

  it("token.desc() stores label (dev semantics aside)", () => {
    const root = new FakeEventTarget();
    const caps = makeCaps({
      getRootTarget: () => root as any,
      getGlobalTarget: () => root as any,
    });

    const impl = new EventModuleImpl(caps, "p-x");

    const t = impl.on("press.commit" as any, (() => {}) as any);
    t.desc("asButton: commit");

    const diags = impl.getDiagnostics();
    expect(diags[0].label).toBe("asButton: commit");
  });
});
