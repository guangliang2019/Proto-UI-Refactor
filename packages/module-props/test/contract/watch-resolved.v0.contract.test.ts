// packages/module-props/test/contract/watch-resolved.v0.contract.test.ts

import { describe, it, expect } from "vitest";
import { PropsKernel } from "../../src/kernel/kernel";

/**
 * Watch Resolved Contract v0
 * Contract Doc: internal/contracts/props/watch-resolved.v0.md
 *
 * Focus:
 * - hydration rule (first applyRaw does not fire)
 * - watchAll trigger condition and info semantics
 * - watch(keys) trigger condition and info semantics
 * - Object.is based diff
 * - order: watchAll before keyed watches; registration order within group
 * - resolved-based (not raw-based) semantics
 */
describe("Props watch(resolved) Contract v0", () => {
  it("PROP-V0-3200: hydration (first applyRaw) never fires resolved watchers", () => {
    const pm = new PropsKernel<any>();
    pm.define({ a: { kind: "number", default: 1 } });

    let calledAll = 0;
    let calledKeyed = 0;

    pm.addWatchAll(() => calledAll++);
    pm.addWatch(["a"], () => calledKeyed++);

    // first applyRaw is hydration => no watch
    pm.applyRaw({ a: 1 });
    expect(calledAll).toBe(0);
    expect(calledKeyed).toBe(0);

    // subsequent applyRaw may watch (if changed)
    pm.applyRaw({ a: 2 });
    expect(calledAll).toBe(1);
    expect(calledKeyed).toBe(1);
  });

  it("PROP-V0-3300: watchAll fires only when at least one declared resolved key changed", () => {
    const pm = new PropsKernel<any>();
    pm.define({
      a: { kind: "number", default: 1 },
      b: { kind: "number", default: 1 },
    });

    let called = 0;
    pm.addWatchAll((_run, _next, _prev, info) => {
      called++;
      expect(info.changedKeysAll.length).toBeGreaterThan(0);
      expect(info.changedKeysMatched).toEqual(info.changedKeysAll);
    });

    // hydration
    pm.applyRaw({ a: 1, b: 1 });

    // raw changes but resolved unchanged (undeclared key only) => should not fire
    pm.applyRaw({ a: 1, b: 1, x: 1 } as any);
    expect(called).toBe(0);

    // resolved change => should fire
    pm.applyRaw({ a: 2, b: 1 });
    expect(called).toBe(1);

    // no resolved change => no fire
    pm.applyRaw({ a: 2, b: 1 });
    expect(called).toBe(1);
  });

  it("PROP-V0-3400: watch(keys) fires only when matched keys changed; info contains all-changed and matched-changed", () => {
    const pm = new PropsKernel<any>();
    pm.define({
      a: { kind: "number", default: 1 },
      b: { kind: "number", default: 1 },
      c: { kind: "number", default: 1 },
    });

    let called = 0;
    pm.addWatch(["a", "b"], (_run, _next, _prev, info) => {
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

    // only undeclared change => no fire
    pm.applyRaw({ a: 1, b: 1, c: 1, x: 1 } as any);
    expect(called).toBe(0);

    // only c changed => no fire (not matched)
    pm.applyRaw({ a: 1, b: 1, c: 2 });
    expect(called).toBe(0);

    // a changed => fire
    pm.applyRaw({ a: 2, b: 1, c: 2 });
    expect(called).toBe(1);

    // b changed => fire
    pm.applyRaw({ a: 2, b: 2, c: 2 });
    expect(called).toBe(2);
  });

  it("PROP-V0-3500: order: watchAll evaluated before keyed watches; registration order preserved within group", () => {
    const pm = new PropsKernel<any>();
    pm.define({ a: { kind: "number", default: 1 } });

    const order: string[] = [];

    pm.addWatchAll(() => order.push("all-1"));
    pm.addWatchAll(() => order.push("all-2"));

    pm.addWatch(["a"], () => order.push("key-1"));
    pm.addWatch(["a"], () => order.push("key-2"));

    // hydration
    pm.applyRaw({ a: 1 });

    // trigger change
    pm.applyRaw({ a: 2 });

    expect(order).toEqual(["all-1", "all-2", "key-1", "key-2"]);
  });

  it("PROP-V0-3100/3600: diff uses Object.is (NaN stable); raw change may not cause resolved change -> no watch", () => {
    const pm = new PropsKernel<any>();
    pm.define({
      a: { kind: "number", default: 1, validator: (v: number) => v > 0 },
    });

    let called = 0;
    pm.addWatchAll(() => called++);

    // hydration
    pm.applyRaw({ a: 2 });

    // raw invalid -> resolved falls back to prevValid (2) => resolved unchanged => no watch
    pm.applyRaw({ a: -1 as any });
    expect(pm.get().a).toBe(2);
    expect(called).toBe(0);

    // NaN rejected by kind:number, falls back to prevValid (2) => unchanged => no watch
    pm.applyRaw({ a: NaN });
    expect(pm.get().a).toBe(2);
    expect(called).toBe(0);

    // now real change => watch fires
    pm.applyRaw({ a: 3 });
    expect(pm.get().a).toBe(3);
    expect(called).toBe(1);
  });

  it('PROP-V0-3600: empty="accept" affects resolved change only for provided-empty; missing still falls back/defaults', () => {
    const pm = new PropsKernel<any>();
    pm.define({
      a: { kind: "number", default: 1, empty: "accept" },
    });

    let called = 0;
    pm.addWatchAll(() => called++);

    // hydration: missing => resolved=1, no watch
    pm.applyRaw({});
    expect(pm.get().a).toBe(1);
    expect(called).toBe(0);

    // provided-empty => resolved becomes null, watch should fire
    pm.applyRaw({ a: null });
    expect(pm.get().a).toBeNull();
    expect(called).toBe(1);

    // missing again => resolved back to default (1), watch should fire
    pm.applyRaw({});
    expect(pm.get().a).toBe(1);
    expect(called).toBe(2);
  });

  it("PROP-V0-3400: watch(keys) rejects empty key list and undeclared keys at registration time", () => {
    const pm = new PropsKernel<any>();
    pm.define({ a: { kind: "number", default: 1 } });

    expect(() => pm.addWatch([], () => {})).toThrow();
    expect(() => pm.addWatch(["x"], () => {})).toThrow();
  });

  it("PROP-V0-3300/3400: run is forwarded from applyRaw(nextRaw, run) into callbacks", () => {
    const pm = new PropsKernel<any>();
    pm.define({ a: { kind: "number", default: 1 } });

    const runObj = { tag: "run" };

    let seenAll: any = null;
    let seenKey: any = null;

    pm.addWatchAll((run) => (seenAll = run));
    pm.addWatch(["a"], (run) => (seenKey = run));

    // hydration
    pm.applyRaw({ a: 1 }, runObj);
    expect(seenAll).toBeNull();
    expect(seenKey).toBeNull();

    // trigger
    pm.applyRaw({ a: 2 }, runObj);
    expect(seenAll).toBe(runObj);
    expect(seenKey).toBe(runObj);
  });
});
