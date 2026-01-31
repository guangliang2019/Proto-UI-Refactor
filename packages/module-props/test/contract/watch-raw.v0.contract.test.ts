// packages/module-props/test/contract/watch-raw.v0.contract.test.ts
import { describe, it, expect } from "vitest";
import { PropsModuleImpl } from "../../src/impl";

/**
 * Watch Raw Contract v0
 * Contract Doc: internal/contracts/props/watch-raw.v0.md
 *
 * Focus (module-level):
 * - hydration rule (first applyRaw does not schedule raw watch tasks)
 * - watchRawAll unionKeys(prev,next) and trigger condition
 * - watchRaw(keys) supports undeclared keys and matched semantics
 * - Object.is diff semantics for raw
 * - ordering: raw tasks before resolved tasks; within raw: rawAll before raw(keys)
 *
 * NOTE:
 * - RunHandle shape & runtime dispatch timing are runtime concerns and live in runtime contracts.
 *   Here we only validate scheduled tasks (next/prev/info ordering).
 */

function createModule() {
  const caps = {
    onChange: (_fn: (epoch: number) => void) => {},
    has: (_k: string) => false,
    get: (_k: string) => undefined,
  } as any;

  return new PropsModuleImpl<any>(caps, "test-proto");
}

function drainTasks(pm: PropsModuleImpl<any>) {
  return pm.consumeTasks();
}

describe("Props watch(raw) Contract v0", () => {
  it("PROP-V0-4200: hydration (first applyRaw) never schedules raw watch tasks", () => {
    const pm = createModule();
    pm.define({ a: { kind: "number", default: 1 } });

    let calledAll = 0;
    let calledKeyed = 0;

    pm.watchRawAllKeys(() => calledAll++);
    pm.watchRawKeys(["a"], () => calledKeyed++);

    // hydration => no tasks
    pm.applyRaw({ a: 1 });
    expect(drainTasks(pm).length).toBe(0);
    expect(calledAll).toBe(0);
    expect(calledKeyed).toBe(0);

    // subsequent applyRaw may schedule (if changed)
    pm.applyRaw({ a: 2 });
    const tasks = drainTasks(pm);
    for (const t of tasks)
      if (t.kind === "raw") t.cb({} as any, t.next, t.prev, t.info);

    expect(calledAll).toBe(1);
    expect(calledKeyed).toBe(1);
  });

  it("PROP-V0-4300: watchRawAll uses unionKeys(prev,next) and schedules only when at least one key changed", () => {
    const pm = createModule();
    pm.define({ a: { kind: "number", default: 1 } });

    const seen: Array<{ all: string[]; matched: string[] }> = [];
    pm.watchRawAllKeys((_run, _nextRaw, _prevRaw, info) => {
      seen.push({
        all: [...info.changedKeysAll].sort(),
        matched: [...info.changedKeysMatched].sort(),
      });
    });

    // hydration
    pm.applyRaw({ a: 1 });
    expect(drainTasks(pm).length).toBe(0);

    // only undeclared added => should schedule, all/matched include x
    pm.applyRaw({ a: 1, x: 1 } as any);
    const t1 = drainTasks(pm);
    for (const t of t1)
      if (t.kind === "raw") t.cb({} as any, t.next, t.prev, t.info);

    expect(seen.length).toBe(1);
    expect(seen[0].all).toEqual(["x"]);
    expect(seen[0].matched).toEqual(["x"]);

    // no raw change => no schedule
    pm.applyRaw({ a: 1, x: 1 } as any);
    expect(drainTasks(pm).length).toBe(0);
    expect(seen.length).toBe(1);

    // remove x => schedule, all includes x
    pm.applyRaw({ a: 1 } as any);
    const t2 = drainTasks(pm);
    for (const t of t2)
      if (t.kind === "raw") t.cb({} as any, t.next, t.prev, t.info);

    expect(seen.length).toBe(2);
    expect(seen[1].all).toEqual(["x"]);
    expect(seen[1].matched).toEqual(["x"]);
  });

  it("PROP-V0-4400: watchRaw(keys) allows undeclared keys and schedules only when matched keys changed", () => {
    const pm = createModule();
    pm.define({ a: { kind: "number", default: 1 } });

    let called = 0;
    let lastAll: string[] = [];
    let lastMatched: string[] = [];

    pm.watchRawKeys(["x", "y"], (_run, _nextRaw, _prevRaw, info) => {
      called++;
      lastAll = [...info.changedKeysAll].sort();
      lastMatched = [...info.changedKeysMatched].sort();
    });

    // hydration
    pm.applyRaw({ a: 1 });
    expect(drainTasks(pm).length).toBe(0);

    // only x changes => schedule
    pm.applyRaw({ a: 1, x: 1 } as any);
    const t1 = drainTasks(pm);
    for (const t of t1)
      if (t.kind === "raw") t.cb({} as any, t.next, t.prev, t.info);

    expect(called).toBe(1);
    expect(lastAll).toEqual(["x"]);
    expect(lastMatched).toEqual(["x"]);

    // only z changes (not matched) => no schedule
    pm.applyRaw({ a: 1, x: 1, z: 1 } as any);
    expect(drainTasks(pm).length).toBe(0);
    expect(called).toBe(1);

    // y changes => schedule, matched=y
    pm.applyRaw({ a: 1, x: 1, z: 1, y: 2 } as any);
    const t2 = drainTasks(pm);
    for (const t of t2)
      if (t.kind === "raw") t.cb({} as any, t.next, t.prev, t.info);

    expect(called).toBe(2);
    expect(lastAll.sort()).toEqual(["y"]);
    expect(lastMatched).toEqual(["y"]);
  });

  it("PROP-V0-4100: Object.is treats NaN as stable (NaN -> NaN does not trigger)", () => {
    const pm = createModule();
    pm.define({ a: { kind: "number", default: 1 } });

    let called = 0;
    pm.watchRawAllKeys(() => called++);

    // hydration
    pm.applyRaw({ x: NaN } as any);
    expect(drainTasks(pm).length).toBe(0);

    // NaN -> NaN should not schedule (Object.is(NaN,NaN) === true)
    pm.applyRaw({ x: NaN } as any);
    expect(drainTasks(pm).length).toBe(0);
    expect(called).toBe(0);
  });

  it("PROP-V0-4100: Object.is distinguishes -0 and 0 (-0 -> 0 triggers)", () => {
    const pm = createModule();
    pm.define({ a: { kind: "number", default: 1 } });

    let called = 0;
    pm.watchRawAllKeys(() => called++);

    // hydration
    pm.applyRaw({ x: -0 } as any);
    expect(drainTasks(pm).length).toBe(0);

    // -0 -> 0 should schedule (Object.is(-0, 0) === false)
    pm.applyRaw({ x: 0 } as any);
    const tasks = drainTasks(pm);
    for (const t of tasks)
      if (t.kind === "raw") t.cb({} as any, t.next, t.prev, t.info);

    expect(called).toBe(1);
  });

  it("PROP-V0-4600: order: raw tasks before resolved tasks; within raw: rawAll before raw(keys)", () => {
    const pm = createModule();
    pm.define({ a: { kind: "number", default: 1 } });

    const order: string[] = [];

    pm.watchRawAllKeys(() => order.push("rawAll-1"));
    pm.watchRawAllKeys(() => order.push("rawAll-2"));
    pm.watchRawKeys(["x"], () => order.push("rawKey-1"));
    pm.watchRawKeys(["x"], () => order.push("rawKey-2"));

    pm.watchAllKeys(() => order.push("resAll-1"));
    pm.watchKeys(["a"], () => order.push("resKey-1"));

    // hydration
    pm.applyRaw({ a: 1, x: 1 } as any);
    expect(drainTasks(pm).length).toBe(0);

    // trigger change
    pm.applyRaw({ a: 2, x: 2 } as any);

    const tasks = drainTasks(pm);
    for (const t of tasks) {
      t.cb({} as any, t.next, t.prev, t.info);
    }

    expect(order).toEqual([
      "rawAll-1",
      "rawAll-2",
      "rawKey-1",
      "rawKey-2",
      "resAll-1",
      "resKey-1",
    ]);
  });

  it("PROP-V0-4400: watchRaw(keys) rejects empty key list", () => {
    const pm = createModule();
    pm.define({ a: { kind: "number", default: 1 } });
    expect(() => pm.watchRawKeys([] as any, () => {})).toThrow();
  });
});
