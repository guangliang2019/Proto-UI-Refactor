// packages/module-props/test/contract/resolve-fallback.v0.contract.test.ts
import { describe, it, expect } from "vitest";
import { PropsKernel } from "../../src/kernel/kernel";
import type { PropsSpecMap } from "@proto-ui/types";

type P = {
  a: number;
  b: number;
};

describe("props: resolve fallback semantics (v0)", () => {
  it("PROP-V0-1100: invalid raw falls back to previous valid resolved (not default)", () => {
    const pm = new PropsKernel<P>();
    const specs: PropsSpecMap<P> = {
      a: { kind: "number", default: 1, validator: (v) => v > 0 },
      b: { kind: "number", default: 2 },
    };
    pm.define(specs);

    // first apply: valid
    pm.applyRaw({ a: 10, b: 2 } as any);
    expect(pm.get().a).toBe(10);

    // second apply: invalid a => fallback to prev valid (10)
    pm.applyRaw({ a: -1, b: 2 } as any);
    expect(pm.get().a).toBe(10);
  });

  it("PROP-V0-1200: missing key uses default (or setDefaults), not previous raw", () => {
    const pm = new PropsKernel<any>();

    pm.define({
      a: { kind: "number", default: 1 },
      b: { kind: "number", default: 2 },
    });

    // provide a
    pm.applyRaw({ a: 10 } as any);
    expect(pm.get().a).toBe(10);
    expect(pm.get().b).toBe(2);

    // now miss a => should use default(1)
    pm.applyRaw({} as any);
    expect(pm.get().a).toBe(1);
  });

  it("PROP-V0-1300: empty=accept treats empty as accepted value (null) and stops fallback chain", () => {
    type P2 = { a: number | null };
    const pm = new PropsKernel<P2>();

    pm.define({
      a: { kind: "number", default: 1, empty: "accept" },
    } satisfies PropsSpecMap<P2>);

    pm.applyRaw({ a: undefined } as any);
    expect(pm.get().a).toBe(null);

    pm.applyRaw({} as any);
    expect(pm.get().a).toBe(1);
  });

  it("PROP-V0-1400: empty=reject treats empty as invalid and triggers fallback", () => {
    const pm = new PropsKernel<any>();

    pm.define({
      a: { kind: "number", default: 1, empty: "reject" },
    });

    pm.applyRaw({ a: 2 } as any);
    expect(pm.get().a).toBe(2);

    // provided empty => invalid => fallback to prev valid (2)
    pm.applyRaw({ a: undefined } as any);
    expect(pm.get().a).toBe(2);
  });

  it("PROP-V0-1500: empty=error throws when provided empty and no non-empty fallback exists", () => {
    const pm = new PropsKernel<any>();

    pm.define({
      a: { kind: "string", empty: "error" },
    });

    expect(() => pm.applyRaw({ a: undefined } as any)).toThrow(/empty="error"/);
    expect(() => pm.applyRaw({ a: null } as any)).toThrow(/empty="error"/);
  });

  it("PROP-V0-1600: missing + empty=error throws if no non-empty fallback exists", () => {
    const pm = new PropsKernel<any>();
    pm.define({
      a: { kind: "number", empty: "error" },
    });
    expect(() => pm.applyRaw({} as any)).toThrow(/missing.*empty="error"/);
  });
});
