// packages/props/test/contract/props.meta.empty-accept.v0.contract.test.ts
import { describe, it, expect } from "vitest";
import { PropsManager } from "@proto-ui/props";
import type { PropsSpecMap } from "@proto-ui/types";

type P = {
  disabled: boolean | null; // author explicitly allows null
  count: number;
};

const specs: PropsSpecMap<P> = {
  disabled: { kind: "boolean", empty: "accept" },
  count: { kind: "number" },
};

describe("props: meta semantics for empty:accept (v0)", () => {
  it("provided empty with empty:accept => resolved null; NOT invalid; is acceptedEmpty", () => {
    const pm = new PropsManager<P>();
    pm.define(specs);

    const meta = pm.applyRaw({ disabled: undefined, count: 1 });

    // ✅ resolved snapshot check
    expect(pm.get().disabled).toBe(null);
    expect(pm.get().count).toBe(1);

    // ✅ meta checks
    expect(meta.providedKeys).toContain("disabled");
    expect(meta.emptyKeys).toContain("disabled");
    expect(meta.acceptedEmptyKeys).toContain("disabled");
    expect(meta.invalidKeys).not.toContain("disabled");

    // accept 是“输入被接受”，不是 fallback
    expect(meta.usedFallbackKeys).not.toContain("disabled");
    expect(meta.providedKeys).toEqual(expect.arrayContaining(["disabled"]));
  });

  it("provided non-empty invalid value => invalidKeys + fallback => resolved null (no defaults)", () => {
    const pm = new PropsManager<P>();
    pm.define(specs);

    const meta = pm.applyRaw({ disabled: "x", count: 1 });

    // ✅ resolved snapshot check: invalid => fallback chain => canonical null (mode any)
    expect(pm.get().disabled).toBe(null);
    expect(meta.providedKeys).toEqual(expect.arrayContaining(["disabled"]));

    // ✅ meta checks
    expect(meta.providedKeys).toContain("disabled");
    expect(meta.emptyKeys).not.toContain("disabled"); // it wasn't empty
    expect(meta.invalidKeys).toContain("disabled");
    expect(meta.acceptedEmptyKeys).not.toContain("disabled");
    expect(meta.usedFallbackKeys).toContain("disabled");
  });

  it('empty:"error" => provided empty MUST throw when no non-empty fallback exists', () => {
    type P2 = { name: string };
    const pm = new PropsManager<P2>();
    const specs2: PropsSpecMap<P2> = {
      name: { kind: "string", empty: "error" },
    };
    pm.define(specs2);

    expect(() => pm.applyRaw({ name: undefined })).toThrow(/empty="error"/);

    // 可选：也把 null 钉一下（同属 provided empty）
    expect(() => pm.applyRaw({ name: null })).toThrow(/empty="error"/);
  });

  it("missing with empty:error throws if no non-empty fallback exists", () => {
    type P3 = { count: number };
    const pm = new PropsManager<P3>();
    pm.define({
      count: { kind: "number", empty: "error" },
    } satisfies PropsSpecMap<P3>);
    expect(() => pm.applyRaw({})).toThrow(/missing.*empty="error"/);
  });
});
