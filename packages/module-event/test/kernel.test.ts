// packages/module-event/test/kernel.test.ts
import { describe, it, expect } from "vitest";
import { EventKernel } from "../src/kernel";
import { FakeEventTarget } from "./utils/fake-event-target";

describe("EventKernel", () => {
  it("on() creates independent registrations (no dedup)", () => {
    const k = new EventKernel();
    const cb = () => {};
    const id1 = k.on("root", "press.commit" as any, cb as any);
    const id2 = k.on("root", "press.commit" as any, cb as any);
    expect(id1).not.toBe(id2);
  });

  it("bindAll() attaches wrappers and dispatch invokes cb(run, ev)", () => {
    const k = new EventKernel();
    const root = new FakeEventTarget();
    const run = { tag: "run" };
    const calls: any[] = [];

    k.on(
      "root",
      "press.commit" as any,
      (r: any, ev: any) => calls.push([r, ev]) as any
    );

    k.bindAll(run, (kind) => (kind === "root" ? (root as any) : (root as any)));

    expect(root.count("press.commit")).toBe(1);

    root.dispatch("press.commit", { x: 1 });
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(run);
    expect(calls[0][1]).toEqual({ x: 1 });
  });

  it("unbindAll() detaches all bound wrappers but keeps registrations", () => {
    const k = new EventKernel();
    const root = new FakeEventTarget();

    k.on("root", "press.commit" as any, (() => {}) as any);
    k.bindAll({}, () => root as any);

    expect(root.count("press.commit")).toBe(1);

    k.unbindAll();
    expect(root.count("press.commit")).toBe(0);

    // Rebind should attach again
    k.bindAll({}, () => root as any);
    expect(root.count("press.commit")).toBe(1);
  });

  it("off() removes ONE matching registration (latest-first) and detaches if bound", () => {
    const k = new EventKernel();
    const root = new FakeEventTarget();
    const cb = (() => {}) as any;

    k.on("root", "press.commit" as any, cb);
    k.on("root", "press.commit" as any, cb);
    k.bindAll({}, () => root as any);

    expect(root.count("press.commit")).toBe(2);

    const removed = k.off("root", "press.commit" as any, cb);
    expect(removed).toBe(true);
    expect(root.count("press.commit")).toBe(1);

    const removed2 = k.off("root", "press.commit" as any, cb);
    expect(removed2).toBe(true);
    expect(root.count("press.commit")).toBe(0);

    const removed3 = k.off("root", "press.commit" as any, cb);
    expect(removed3).toBe(false);
  });

  it("offById() removes the exact entry", () => {
    const k = new EventKernel();
    const root = new FakeEventTarget();
    const cb = (() => {}) as any;

    const id1 = k.on("root", "press.commit" as any, cb);
    const id2 = k.on("root", "press.commit" as any, cb);

    k.bindAll({}, () => root as any);
    expect(root.count("press.commit")).toBe(2);

    expect(k.offById(id1)).toBe(true);
    expect(root.count("press.commit")).toBe(1);

    expect(k.offById(id2)).toBe(true);
    expect(root.count("press.commit")).toBe(0);
  });

  it("setLabel() affects diagnostics snapshot", () => {
    const k = new EventKernel();
    const id = k.on("root", "press.commit" as any, (() => {}) as any);

    expect(k.setLabel(id, "from asButton")).toBe(true);

    const diags = k.snapshot();
    expect(diags[0].label).toBe("from asButton");
  });
});
