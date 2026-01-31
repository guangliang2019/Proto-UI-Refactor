// packages/module-props/test/contract/watch-resolved.v0.contract.test.ts
import { describe, it, expect } from "vitest";
import { PropsModuleImpl } from "../../src/impl";

/**
 * Watch Resolved Contract v0
 * Contract Doc: internal/contracts/props/watch-resolved.v0.md
 *
 * Focus (module-level):
 * - hydration rule (first applyRaw does not schedule resolved watch tasks)
 * - watchAll trigger condition and info semantics
 * - watch(keys) trigger condition and info semantics
 * - Object.is based diff (via WatchInfo)
 * - order: watchAll before keyed watches; registration order within group
 * - resolved-based (not raw-based) semantics
 *
 * NOTE:
 * - RunHandle shape & wiring is a runtime concern and is tested in runtime contracts.
 *   Here we only ensure tasks are produced with correct next/prev/info and ordering.
 */

function createModule() {
  // Minimal CapsVaultView stub: watch tests use direct applyRaw(), so no caps are needed.
  const caps = {
    onChange: (_fn: (epoch: number) => void) => {},
    has: (_k: string) => false,
    get: (_k: string) => undefined,
  } as any;

  return new PropsModuleImpl<any>(caps, "test-proto");
}

function execResolvedTasks(mod: PropsModuleImpl<any>) {
  const tasks = mod.consumeTasks();
  const run = {} as any;
  for (const t of tasks) {
    if (t.kind !== "resolved") continue;
    t.cb(run, t.next, t.prev, t.info);
  }
  return tasks;
}

describe("Props watch(resolved) Contract v0", () => {
  it("PROP-V0-3200: hydration (first applyRaw) never schedules resolved watch tasks", () => {
    const pm = createModule();
    pm.define({ a: { kind: "number", default: 1 } });

    let calledAll = 0;
    let calledKeyed = 0;

    pm.watchAllKeys(() => calledAll++);
    pm.watchKeys(["a"], () => calledKeyed++);

    // first applyRaw is hydration => no watch tasks
    pm.applyRaw({ a: 1 });
    expect(pm.consumeTasks().length).toBe(0);
    expect(calledAll).toBe(0);
    expect(calledKeyed).toBe(0);

    // subsequent applyRaw may schedule tasks (if changed)
    pm.applyRaw({ a: 2 });
    execResolvedTasks(pm);

    expect(calledAll).toBe(1);
    expect(calledKeyed).toBe(1);
  });

  it("PROP-V0-3300: watchAll schedules only when at least one declared resolved key changed", () => {
    const pm = createModule();
    pm.define({
      a: { kind: "number", default: 1 },
      b: { kind: "number", default: 1 },
    });

    let called = 0;
    pm.watchAllKeys((_run, _next, _prev, info) => {
      called++;
      expect(info.changedKeysAll.length).toBeGreaterThan(0);
      expect(info.changedKeysMatched).toEqual(info.changedKeysAll);
    });

    // hydration
    pm.applyRaw({ a: 1, b: 1 });
    expect(pm.consumeTasks().length).toBe(0);

    // raw changes but resolved unchanged (undeclared key only) => should not schedule
    pm.applyRaw({ a: 1, b: 1, x: 1 } as any);
    expect(pm.consumeTasks().length).toBe(0);
    expect(called).toBe(0);

    // resolved change => should schedule
    pm.applyRaw({ a: 2, b: 1 });
    execResolvedTasks(pm);
    expect(called).toBe(1);

    // no resolved change => no schedule
    pm.applyRaw({ a: 2, b: 1 });
    expect(pm.consumeTasks().length).toBe(0);
    expect(called).toBe(1);
  });

  it("PROP-V0-3400: watch(keys) schedules only when matched keys changed; info contains all-changed and matched-changed", () => {
    const pm = createModule();
    pm.define({
      a: { kind: "number", default: 1 },
      b: { kind: "number", default: 1 },
      c: { kind: "number", default: 1 },
    });

    let called = 0;
    pm.watchKeys(["a", "b"], (_run, _next, _prev, info) => {
      called++;
      // matched is subset of keys
      for (const k of info.changedKeysMatched) {
        expect(["a", "b"]).toContain(k);
      }
      // all contains all declared keys that changed
      for (const k of info.changedKeysAll) {
        expect(["a", "b", "c"]).toContain(k);
      }
      expect(info.changedKeysMatched.length).toBeGreaterThan(0);
    });

    // hydration
    pm.applyRaw({ a: 1, b: 1, c: 1 });
    expect(pm.consumeTasks().length).toBe(0);

    // only undeclared change => no schedule
    pm.applyRaw({ a: 1, b: 1, c: 1, x: 1 } as any);
    expect(pm.consumeTasks().length).toBe(0);
    expect(called).toBe(0);

    // only c changed => no schedule (not matched)
    pm.applyRaw({ a: 1, b: 1, c: 2 });
    expect(pm.consumeTasks().length).toBe(0);
    expect(called).toBe(0);

    // a changed => schedule
    pm.applyRaw({ a: 2, b: 1, c: 2 });
    execResolvedTasks(pm);
    expect(called).toBe(1);

    // b changed => schedule
    pm.applyRaw({ a: 2, b: 2, c: 2 });
    execResolvedTasks(pm);
    expect(called).toBe(2);
  });

  it("PROP-V0-3500: order: watchAll before keyed watches; registration order preserved within group", () => {
    const pm = createModule();
    pm.define({ a: { kind: "number", default: 1 } });

    const order: string[] = [];

    pm.watchAllKeys(() => order.push("all-1"));
    pm.watchAllKeys(() => order.push("all-2"));

    pm.watchKeys(["a"], () => order.push("key-1"));
    pm.watchKeys(["a"], () => order.push("key-2"));

    // hydration
    pm.applyRaw({ a: 1 });
    expect(pm.consumeTasks().length).toBe(0);

    // trigger change
    pm.applyRaw({ a: 2 });
    execResolvedTasks(pm);

    expect(order).toEqual(["all-1", "all-2", "key-1", "key-2"]);
  });

  it("PROP-V0-3100/3600: diff uses Object.is (NaN stable); raw change may not cause resolved change -> no schedule", () => {
    const pm = createModule();
    pm.define({
      a: { kind: "number", default: 1, validator: (v: number) => v > 0 },
    });

    let called = 0;
    pm.watchAllKeys(() => called++);

    // hydration
    pm.applyRaw({ a: 2 });
    expect(pm.consumeTasks().length).toBe(0);

    // raw invalid -> resolved falls back to prevValid (2) => resolved unchanged => no schedule
    pm.applyRaw({ a: -1 as any });
    expect(pm.get().a).toBe(2);
    expect(pm.consumeTasks().length).toBe(0);
    expect(called).toBe(0);

    // NaN rejected by kind:number, falls back to prevValid (2) => unchanged => no schedule
    pm.applyRaw({ a: NaN });
    expect(pm.get().a).toBe(2);
    expect(pm.consumeTasks().length).toBe(0);
    expect(called).toBe(0);

    // now real change => schedule
    pm.applyRaw({ a: 3 });
    execResolvedTasks(pm);
    expect(pm.get().a).toBe(3);
    expect(called).toBe(1);
  });

  it('PROP-V0-3600: empty="accept" affects resolved change only for provided-empty; missing still falls back/defaults', () => {
    const pm = createModule();
    pm.define({
      a: { kind: "number", default: 1, empty: "accept" },
    });

    let called = 0;
    pm.watchAllKeys(() => called++);

    // hydration: missing => resolved=1, no schedule
    pm.applyRaw({});
    expect(pm.get().a).toBe(1);
    expect(pm.consumeTasks().length).toBe(0);
    expect(called).toBe(0);

    // provided-empty => resolved becomes null, should schedule
    pm.applyRaw({ a: null });
    execResolvedTasks(pm);
    expect(pm.get().a).toBeNull();
    expect(called).toBe(1);

    // missing again => resolved back to default (1), should schedule
    pm.applyRaw({});
    execResolvedTasks(pm);
    expect(pm.get().a).toBe(1);
    expect(called).toBe(2);
  });

  it("PROP-V0-3400: watch(keys) rejects empty key list and undeclared keys at registration time", () => {
    const pm = createModule();
    pm.define({ a: { kind: "number", default: 1 } });

    expect(() => pm.watchKeys([] as any, () => {})).toThrow();
    expect(() => pm.watchKeys(["x"] as any, () => {})).toThrow();
  });
});
