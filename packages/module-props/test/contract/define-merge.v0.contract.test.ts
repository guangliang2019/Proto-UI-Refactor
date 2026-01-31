// packages/module-props/test/contract/define-merge.v0.contract.test.ts
import { describe, it, expect } from "vitest";
import { PropsKernel } from "../../src/kernel/kernel";
import type { PropsSpecMap } from "@proto-ui/types";

type P = {
  a: number;
  b: boolean;
  c: string;
};

describe("props: define/merge semantics (v0)", () => {
  it("PROP-V0-0100: define() must accept a PropsSpecMap and initialize defaults", () => {
    const pm = new PropsKernel<P>();

    const specs: PropsSpecMap<P> = {
      a: { kind: "number", default: 1 },
      b: { kind: "boolean", default: false },
      c: { kind: "string", default: "x" },
    };

    pm.define(specs);

    const v = pm.get();
    expect(v.a).toBe(1);
    expect(v.b).toBe(false);
    expect(v.c).toBe("x");
  });

  it("PROP-V0-0200: define() may be called multiple times; later define merges new keys", () => {
    const pm = new PropsKernel<any>();

    pm.define({
      a: { kind: "number", default: 1 },
    });

    pm.define({
      b: { kind: "boolean", default: false },
    });

    const v = pm.get();
    expect(v.a).toBe(1);
    expect(v.b).toBe(false);
  });

  it("PROP-V0-0300: define() may override existing key spec (last-one-wins)", () => {
    const pm = new PropsKernel<any>();

    pm.define({
      a: { kind: "number", default: 1 },
    });

    pm.define({
      a: { kind: "number", default: 2 },
    });

    const v = pm.get();
    expect(v.a).toBe(2);
  });

  it("PROP-V0-0400: setDefaults() can patch defaults post-define; only affects missing keys", () => {
    type P2 = { a: number; b: number };
    const pm = new PropsKernel<P2>();

    pm.define({
      a: { kind: "number", default: 1 },
      b: { kind: "number", default: 2 },
    });

    // raw provides a => resolved a fixed to provided
    pm.applyRaw({ a: 10 } as any);

    pm.setDefaults({ a: 100, b: 200 });

    const v = pm.get();
    expect(v.a).toBe(10);
    expect(v.b).toBe(200);
  });

  it("PROP-V0-0500: setDefaults() rejects keys not in specs", () => {
    type P2 = { a: number };
    const pm = new PropsKernel<P2>();

    pm.define({
      a: { kind: "number", default: 1 },
    });

    expect(() => pm.setDefaults({ x: 1 } as any)).toThrow();
  });
});
