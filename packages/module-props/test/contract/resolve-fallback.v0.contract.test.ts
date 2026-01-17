// packages/module-props/test/contract/resolve-fallback.v0.contract.test.ts
import { describe, it, expect } from "vitest";
import { PropsKernel } from "../../src/kernel/kernel";

/**
 * Resolve & Fallback Contract v0
 * Contract Doc: internal/contracts/props/resolve-fallback.v0.md
 *
 * Each test block corresponds to a PROP-V0-2xxx section.
 */

describe("Props Resolve & Fallback Contract v0", () => {
  /**
   * PROP-V0-2000
   * Input classification: missing / provided-empty / provided-non-empty / invalid
   */
  describe("PROP-V0-2000 input classification", () => {
    it("missing: key not present on raw props", () => {
      const pm = new PropsKernel<any>();;
      pm.define({ a: { kind: "number", default: 1 } });

      pm.applyRaw({});
      expect(pm.isProvided("a")).toBe(false);
      expect(pm.get().a).toBe(1);
    });

    it("provided-empty: null or undefined counts as provided", () => {
      const pm = new PropsKernel<any>();;
      pm.define({ a: { kind: "number", default: 1 } });

      pm.applyRaw({ a: undefined });
      expect(pm.isProvided("a")).toBe(true);

      pm.applyRaw({ a: null });
      expect(pm.isProvided("a")).toBe(true);
    });
  });

  /**
   * PROP-V0-2100
   * get / getRaw / isProvided
   */
  describe("PROP-V0-2100 runtime APIs", () => {
    it("get() returns declared keys only and never undefined", () => {
      const pm = new PropsKernel<any>();;
      pm.define({ a: { kind: "number", default: 1 } });

      pm.applyRaw({ a: 2, x: 9 });
      const snap = pm.get();

      expect(snap).toEqual({ a: 2 });
      expect(Object.values(snap).includes(undefined)).toBe(false);
    });

    it("getRaw() returns raw props as-is", () => {
      const pm = new PropsKernel<any>();;
      pm.define({ a: { kind: "number", default: 1 } });

      pm.applyRaw({ a: undefined, x: 9 });
      expect(pm.getRaw()).toEqual({ a: undefined, x: 9 });
    });
  });

  /**
   * PROP-V0-2200
   * Resolved output invariants
   */
  describe("PROP-V0-2200 resolved output invariants", () => {
    it("resolved snapshot always contains all declared keys", () => {
      const pm = new PropsKernel<any>();;
      pm.define({
        a: { kind: "number", default: 1 },
        b: { kind: "string", default: "x" },
      });

      pm.applyRaw({});
      expect(pm.get()).toHaveProperty("a");
      expect(pm.get()).toHaveProperty("b");
    });

    it("resolved snapshot is shallowly immutable", () => {
      const pm = new PropsKernel<any>();;
      pm.define({ a: { kind: "number", default: 1 } });

      pm.applyRaw({});
      const snap: any = pm.get();

      expect(() => {
        snap.a = 3;
      }).toThrow();
    });
  });

  /**
   * PROP-V0-2300
   * EmptyBehavior: accept
   */
  describe('PROP-V0-2300 empty="accept"', () => {
    it("accept applies only to provided-empty, not missing", () => {
      const pm = new PropsKernel<any>();;
      pm.define({
        a: { kind: "number", default: 1, empty: "accept" },
      });

      // missing -> fallback to default
      pm.applyRaw({});
      expect(pm.get().a).toBe(1);

      // provided-empty -> accept -> null
      pm.applyRaw({ a: null });
      expect(pm.get().a).toBeNull();
    });

    it("accept does not convert invalid non-empty into null", () => {
      const pm = new PropsKernel<any>();;
      pm.define({
        a: {
          kind: "number",
          default: 1,
          empty: "accept",
          validator: (v: number) => v > 0,
        },
      });

      pm.applyRaw({ a: 2 });
      expect(pm.get().a).toBe(2);

      pm.applyRaw({ a: -1 as any }); // invalid non-empty
      expect(pm.get().a).toBe(2); // fallback to prevValid
    });
  });

  /**
   * PROP-V0-2400
   * EmptyBehavior: fallback
   */
  describe('PROP-V0-2400 empty="fallback"', () => {
    it("fallback chain order: prevValid > defaults > decl.default > null", () => {
      const pm = new PropsKernel<any>();;
      pm.define({ a: { kind: "number", default: 1 } });

      pm.applyRaw({ a: 2 });
      expect(pm.get().a).toBe(2);

      pm.applyRaw({ a: null });
      expect(pm.get().a).toBe(2);
    });

    it("fallback resolves to null if no defaults exist", () => {
      const pm = new PropsKernel<any>();;
      pm.define({ a: { kind: "number" } });

      pm.applyRaw({});
      expect(pm.get().a).toBeNull();
    });
  });

  /**
   * PROP-V0-2500
   * EmptyBehavior: error
   */
  describe('PROP-V0-2500 empty="error"', () => {
    it("throws if missing and no valid fallback exists", () => {
      const pm = new PropsKernel<any>();;
      pm.define({ a: { kind: "number", empty: "error" } });

      expect(() => pm.applyRaw({})).toThrow();
    });

    it("falls back to prevValid if available", () => {
      const pm = new PropsKernel<any>();;
      pm.define({ a: { kind: "number", empty: "error" } });

      pm.applyRaw({ a: 2 });
      expect(pm.get().a).toBe(2);

      pm.applyRaw({ a: null });
      expect(pm.get().a).toBe(2);
    });
  });

  /**
   * PROP-V0-2600
   * prevValid rules
   */
  describe("PROP-V0-2600 prevValid semantics", () => {
    it("null is never written to prevValid", () => {
      const pm = new PropsKernel<any>();;
      pm.define({
        a: { kind: "number", default: 1, empty: "accept" },
      });

      pm.applyRaw({ a: null });
      expect(pm.get().a).toBeNull();

      pm.applyRaw({});
      expect(pm.get().a).toBe(1);
    });
  });

  /**
   * PROP-V0-2700
   * Validation semantics (minimal, v0)
   */
  describe("PROP-V0-2700 validation semantics", () => {
    it("kind:number rejects NaN", () => {
      const pm = new PropsKernel<any>();;
      pm.define({ a: { kind: "number", default: 1 } });

      pm.applyRaw({ a: NaN });
      expect(pm.get().a).toBe(1);
    });

    it("kind:object accepts arrays and objects", () => {
      const pm = new PropsKernel<any>();;
      pm.define({ a: { kind: "object", empty: "accept" } });

      pm.applyRaw({ a: [] });
      expect(pm.get().a).toEqual([]);

      pm.applyRaw({ a: {} });
      expect(pm.get().a).toEqual({});
    });
  });
});
