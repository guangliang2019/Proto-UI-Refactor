// packages/props/test/props.test.ts

import { describe, it, expect } from "vitest";
import { PropsManager } from "@proto-ui/props";

describe("@proto-ui/props PropsManager (EmptyBehavior)", () => {
  it("PROP-0001: get only returns declared keys, getRaw returns all", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });
    pm.applyRaw({ a: 2, x: 9 });

    expect(pm.get()).toEqual({ a: 2 });
    expect(pm.getRaw()).toEqual({ a: 2, x: 9 });
  });

  it("PROP-0002: isProvided uses own property; provided undefined is empty", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });

    pm.applyRaw({});
    expect(pm.isProvided("a")).toBe(false);
    expect(pm.get().a).toBe(1);

    pm.applyRaw({ a: undefined });
    expect(pm.isProvided("a")).toBe(true);
    // empty => fallback to default (empty default is fallback)
    expect(pm.get().a).toBe(1);
  });

  it("PROP-0003: setDefaults latest-first wins", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number" } });
    pm.setDefaults({ a: 1 });
    pm.setDefaults({ a: 2 });

    pm.applyRaw({});
    expect(pm.get().a).toBe(2);
  });

  it("PROP-0012: kind conflict errors", () => {
    const pm = new PropsManager();
    pm.define({ disabled: { kind: "boolean" } });

    expect(() => pm.define({ disabled: { kind: "string" } as any })).toThrow();
  });

  it("PROP-0013/0014: enum widen allowed (warning), tighten error", () => {
    const pm = new PropsManager();
    pm.define({ mode: { kind: "string", enum: ["a", "b"] } });

    pm.define({ mode: { kind: "string", enum: ["a", "b", "c"] } });
    expect(pm.getDiagnostics().some((d) => d.level === "warning")).toBe(true);

    // tightening from current superset to subset would be an error:
    const pm2 = new PropsManager();
    pm2.define({ mode: { kind: "string", enum: ["a", "b", "c"] } });
    expect(() =>
      pm2.define({ mode: { kind: "string", enum: ["a", "b"] } })
    ).toThrow();
  });

  it("PROP-0020/0021: validator invalid falls back previous-valid > default", () => {
    const pm = new PropsManager();
    pm.define({
      a: { kind: "number", default: 1, validator: (v: number) => v > 0 },
    });

    pm.applyRaw({ a: -1 });
    expect(pm.get().a).toBe(1);

    pm.applyRaw({ a: 2 });
    expect(pm.get().a).toBe(2);

    pm.applyRaw({ a: -1 });
    expect(pm.get().a).toBe(2);
  });

  it("PROP-0031: watch(keys) only fires when matched keys changed", () => {
    const pm = new PropsManager();
    pm.define({
      a: { kind: "number", default: 1 },
      b: { kind: "number", default: 1 },
    });

    let called = 0;
    pm.addWatch(["a", "b"], () => called++);

    pm.applyRaw({ a: 1, b: 1, c: 0 });
    pm.applyRaw({ a: 1, b: 1, c: 1 });

    expect(called).toBe(0);

    pm.applyRaw({ a: 2, b: 1, c: 1 });
    expect(called).toBe(1);
  });

  it("PROP-0030: watchAll exists; watch(keys) requires non-empty", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });

    expect(() => pm.addWatch([], () => {})).toThrow();

    let called = 0;
    pm.addWatchAll(() => called++);
    pm.applyRaw({ a: 1 }); // hydration => no watches
    pm.applyRaw({ a: 2 }); // now should fire
    expect(called).toBe(1);
  });

  it("PROP-0040: get returns readonly snapshot (shallow)", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });
    pm.applyRaw({ a: 2 });

    const snap: any = pm.get();
    expect(() => {
      snap.a = 3;
    }).toThrow();
  });

  it('PROP-0100: empty="accept" only accepts PROVIDED empty; missing still uses fallback/default', () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1, empty: "accept" } });

    // missing => fallback/default (NOT null)
    pm.applyRaw({});
    expect(pm.get().a).toBe(1);

    // provided empty => accept => null
    pm.applyRaw({ a: null });
    expect(pm.get().a).toBe(null);

    pm.applyRaw({ a: undefined });
    expect(pm.get().a).toBe(null);

    // provided non-empty => normal
    pm.applyRaw({ a: 2 });
    expect(pm.get().a).toBe(2);
  });

  it('PROP-0101: empty="accept" does NOT accept invalid non-empty; invalid falls back', () => {
    const pm = new PropsManager();
    pm.define({
      a: { kind: "number", default: 1, empty: "accept", range: { min: 0 } },
    });

    pm.applyRaw({ a: 2 });
    expect(pm.get().a).toBe(2);

    // invalid non-empty => fallback to prevValid (2), NOT null
    pm.applyRaw({ a: -1 as any });
    expect(pm.get().a).toBe(2);
  });

  it('PROP-0110: empty="error" missing throws if no non-empty fallback exists', () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", empty: "error" } });

    expect(() => pm.applyRaw({})).toThrow();
  });

  it('PROP-0111: empty="error" provided empty throws if no non-empty fallback exists', () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", empty: "error" } });

    expect(() => pm.applyRaw({ a: null })).toThrow();
    expect(() => pm.applyRaw({ a: undefined })).toThrow();
  });

  it('PROP-0112: empty="error" invalid non-empty throws if no non-empty fallback exists', () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", empty: "error", range: { min: 0 } } });

    expect(() => pm.applyRaw({ a: -1 as any })).toThrow();
  });

  it('PROP-0113: empty="error" falls back to prevValid when available (empty + invalid)', () => {
    const pm = new PropsManager();
    pm.define({
      a: { kind: "number", empty: "error", range: { min: 0 } },
    });

    pm.applyRaw({ a: 2 });
    expect(pm.get().a).toBe(2);

    // empty => must fallback to non-empty prevValid
    pm.applyRaw({ a: null as any });
    expect(pm.get().a).toBe(2);

    // invalid non-empty => must fallback to non-empty prevValid
    pm.applyRaw({ a: -1 as any });
    expect(pm.get().a).toBe(2);
  });

  it("PROP-0120: merge empty behavior stricter errors; looser warns; omit does nothing", () => {
    // baseline: fallback
    const pm = new PropsManager();
    pm.define({ x: { kind: "number" } }); // empty defaults to fallback

    // stricter: fallback -> error => error
    expect(() =>
      pm.define({ x: { kind: "number", empty: "error" } })
    ).toThrow();

    // looser: fallback -> accept => warning
    const pm2 = new PropsManager();
    pm2.define({ x: { kind: "number" } });
    pm2.define({ x: { kind: "number", empty: "accept" } });

    expect(
      pm2
        .getDiagnostics()
        .some(
          (d) =>
            d.level === "warning" &&
            d.key === "x" &&
            d.message.includes("empty behavior becomes looser")
        )
    ).toBe(true);

    // omit empty => no warning
    const pm3 = new PropsManager();
    pm3.define({ x: { kind: "number", empty: "error" } });
    pm3.define({ x: { kind: "number" } }); // omit empty
    expect(pm3.getDiagnostics().some((d) => d.key === "x")).toBe(false);
  });
});
