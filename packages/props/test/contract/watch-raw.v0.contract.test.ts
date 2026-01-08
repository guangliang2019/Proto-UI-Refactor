// packages/props/test/contract/watch-raw.v0.contract.test.ts

import { describe, it, expect } from "vitest";
import { PropsManager } from "@proto-ui/props";

/**
 * Watch Raw Contract v0
 * Contract Doc: internal/contracts/props/watch-raw.v0.md
 *
 * Focus:
 * - hydration rule (first applyRaw does not fire)
 * - unionKeys-based changedKeysAll
 * - Object.is based diff
 * - watchRawAll / watchRaw(keys) trigger conditions
 * - watchRaw(keys) allows undeclared keys
 * - callback argument ordering & group ordering (raw before resolved)
 * - devWarn diagnostics behavior (not deduped)
 */
describe("Props watch(raw) Contract v0", () => {
  it("PROP-V0-4200: hydration (first applyRaw) never fires raw watchers", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });

    let calledAll = 0;
    let calledKeyed = 0;

    pm.addWatchRawAll(() => calledAll++);
    pm.addWatchRaw(["a"], () => calledKeyed++);

    // first applyRaw is hydration => no raw watch
    pm.applyRaw({ a: 1 });
    expect(calledAll).toBe(0);
    expect(calledKeyed).toBe(0);

    // subsequent applyRaw may watch (if changed)
    pm.applyRaw({ a: 2 });
    expect(calledAll).toBe(1);
    expect(calledKeyed).toBe(1);
  });

  it("PROP-V0-4300: watchRawAll uses unionKeys(prev,next) and fires only when at least one key changed", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });

    const seen: Array<{ all: string[]; matched: string[] }> = [];
    pm.addWatchRawAll((_run, _nextRaw, _prevRaw, info) => {
      seen.push({
        all: [...info.changedKeysAll].sort(),
        matched: [...info.changedKeysMatched].sort(),
      });
    });

    // hydration
    pm.applyRaw({ a: 1 });

    // add undeclared key => unionKeys includes it => changedKeysAll should include 'x'
    pm.applyRaw({ a: 1, x: 1 } as any);
    expect(seen.length).toBe(1);
    expect(seen[0].all).toEqual(["x"]);
    expect(seen[0].matched).toEqual(["x"]);

    // remove key => unionKeys includes it => changedKeysAll should include 'x'
    pm.applyRaw({ a: 1 } as any);
    expect(seen.length).toBe(2);
    expect(seen[1].all).toEqual(["x"]);
    expect(seen[1].matched).toEqual(["x"]);

    // no change => should not fire
    pm.applyRaw({ a: 1 } as any);
    expect(seen.length).toBe(2);
  });

  it("PROP-V0-4400: watchRaw(keys) allows undeclared keys and fires only when matched keys changed", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });

    let called = 0;
    let lastAll: string[] = [];
    let lastMatched: string[] = [];

    pm.addWatchRaw(["x", "y"], (_run, _nextRaw, _prevRaw, info) => {
      called++;
      lastAll = [...info.changedKeysAll].sort();
      lastMatched = [...info.changedKeysMatched].sort();
    });

    // hydration
    pm.applyRaw({ a: 1 });

    // change undeclared x => should fire (matched)
    pm.applyRaw({ a: 1, x: 1 } as any);
    expect(called).toBe(1);
    expect(lastMatched).toEqual(["x"]);
    expect(lastAll).toEqual(["x"]);

    // change undeclared z (not matched) => should NOT fire (but would be in changedKeysAll if it fired)
    pm.applyRaw({ a: 1, x: 1, z: 1 } as any);
    expect(called).toBe(1);

    // remove matched key x => should fire with matched 'x'
    pm.applyRaw({ a: 1, z: 1 } as any);
    expect(called).toBe(2);
    expect(lastMatched).toEqual(["x"]);
    expect(lastAll).toEqual(["x"]);
  });

  it("PROP-V0-4100: Object.is treats NaN as stable (NaN -> NaN does not trigger)", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });
  
    let calledAll = 0;
    let calledKeyed = 0;
  
    pm.addWatchRawAll(() => calledAll++);
    pm.addWatchRaw(["x"], () => calledKeyed++);
  
    // hydration
    pm.applyRaw({ a: 1, x: NaN } as any);
  
    // NaN -> NaN should be Object.is true => no fire
    pm.applyRaw({ a: 1, x: NaN } as any);
  
    expect(calledAll).toBe(0);
    expect(calledKeyed).toBe(0);
  });
  
  it("PROP-V0-4100: Object.is distinguishes -0 and 0 (-0 -> 0 triggers)", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });
  
    let calledAll = 0;
    let calledKeyed = 0;
  
    pm.addWatchRawAll(() => calledAll++);
    pm.addWatchRaw(["x"], () => calledKeyed++);
  
    // hydration with -0
    pm.applyRaw({ a: 1, x: -0 } as any);
  
    // -0 -> 0 is Object.is false => fire once
    pm.applyRaw({ a: 1, x: 0 } as any);
  
    expect(calledAll).toBe(1);
    expect(calledKeyed).toBe(1);
  });
  

  it("PROP-V0-4600: order: raw watchers run before resolved watchers; within raw: rawAll before raw(keys)", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });

    const order: string[] = [];

    pm.addWatchRawAll(() => order.push("rawAll-1"));
    pm.addWatchRawAll(() => order.push("rawAll-2"));
    pm.addWatchRaw(["x"], () => order.push("rawKey-1"));
    pm.addWatchRaw(["x"], () => order.push("rawKey-2"));

    pm.addWatchAll(() => order.push("resAll-1"));
    pm.addWatch(["a"], () => order.push("resKey-1"));

    // hydration
    pm.applyRaw({ a: 1 } as any);

    // trigger both raw and resolved:
    // - raw: add x (changed)
    // - resolved: change a
    pm.applyRaw({ a: 2, x: 1 } as any);

    expect(order).toEqual([
      "rawAll-1",
      "rawAll-2",
      "rawKey-1",
      "rawKey-2",
      "resAll-1",
      "resKey-1",
    ]);
  });

  it("PROP-V0-4500: raw watchers record devWarn diagnostics by default; not required to de-duplicate", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });

    // register with default devWarn=true
    pm.addWatchRawAll(() => {});
    pm.addWatchRaw(["x"], () => {});

    // hydration
    pm.applyRaw({ a: 1 } as any);

    // 1st triggering apply => should push warnings (at least once each)
    pm.applyRaw({ a: 1, x: 1 } as any);

    const w1 = pm
      .getDiagnostics()
      .filter(
        (d) => d.level === "warning" && d.message.includes("escape hatch")
      );

    expect(w1.length).toBeGreaterThanOrEqual(2);

    // 2nd triggering apply => may push again (no dedupe guarantee)
    pm.applyRaw({ a: 1, x: 2 } as any);

    const w2 = pm
      .getDiagnostics()
      .filter(
        (d) => d.level === "warning" && d.message.includes("escape hatch")
      );

    expect(w2.length).toBeGreaterThanOrEqual(w1.length);
  });

  it("PROP-V0-4300/4400: run is forwarded from applyRaw(nextRaw, run) into raw callbacks", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });

    const runObj = { tag: "run" };

    let seenAll: any = null;
    let seenKey: any = null;

    pm.addWatchRawAll((run) => (seenAll = run));
    pm.addWatchRaw(["x"], (run) => (seenKey = run));

    // hydration
    pm.applyRaw({ a: 1 } as any, runObj);
    expect(seenAll).toBeNull();
    expect(seenKey).toBeNull();

    // trigger
    pm.applyRaw({ a: 1, x: 1 } as any, runObj);
    expect(seenAll).toBe(runObj);
    expect(seenKey).toBe(runObj);
  });

  it("PROP-V0-4400: watchRaw(keys) rejects empty key list", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });

    expect(() => pm.addWatchRaw([], () => {})).toThrow();
  });
});
