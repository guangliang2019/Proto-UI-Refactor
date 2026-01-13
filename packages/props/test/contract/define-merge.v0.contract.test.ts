import { describe, it, expect } from "vitest";
import { PropsManager } from "@proto-ui/props";

/**
 * Define & Merge Contract v0
 * Contract Doc: internal/contracts/props/define-merge.v0.md
 *
 * NOTE:
 * This test suite currently reflects the **implementation behavior** of mergeSpecs.
 * If you decide to forbid "adding new constraints" (enum/range from none -> some),
 * update both contract doc and tests accordingly.
 */

describe("Props Define & Merge Contract v0", () => {
  it("PROP-V0-1100: kind conflict throws", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "string" } });

    expect(() => pm.define({ a: { kind: "number" } as any })).toThrow();
  });

  it("PROP-V0-1200: empty stricter throws; looser warns; omit does not change", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", empty: "fallback" } });

    // stricter: fallback -> error
    expect(() =>
      pm.define({ a: { kind: "number", empty: "error" } })
    ).toThrow();

    // new manager for looser path
    const pm2 = new PropsManager();
    pm2.define({ a: { kind: "number", empty: "error" } });

    // looser: error -> fallback (warning)
    pm2.define({ a: { kind: "number", empty: "fallback" } });
    expect(
      pm2
        .getDiagnostics()
        .some(
          (d) =>
            d.level === "warning" &&
            d.key === "a" &&
            d.message.includes("empty behavior becomes looser")
        )
    ).toBe(true);

    // omit empty: should not warn, should not change base empty
    const pm3 = new PropsManager();
    pm3.define({ a: { kind: "number", empty: "error" } });
    pm3.define({ a: { kind: "number" } });
    expect(pm3.getDiagnostics().some((d) => d.key === "a")).toBe(false);
  });

  it("PROP-V0-1300: enum subset throws; superset warns", () => {
    const pm = new PropsManager();
    pm.define({ mode: { kind: "string", enum: ["a", "b"] } });

    // superset => warning
    pm.define({ mode: { kind: "string", enum: ["a", "b", "c"] } });
    expect(pm.getDiagnostics().some((d) => d.level === "warning")).toBe(true);

    // subset => error
    expect(() =>
      pm.define({ mode: { kind: "string", enum: ["a", "b"] } })
    ).toThrow();
  });

  it("PROP-V0-1400: range narrower throws; wider warns", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", range: { min: 0, max: 10 } } });

    // wider => warning
    pm.define({ a: { kind: "number", range: { min: -1, max: 11 } } });
    expect(pm.getDiagnostics().some((d) => d.level === "warning")).toBe(true);

    // narrower => error
    expect(() =>
      pm.define({ a: { kind: "number", range: { min: 0, max: 10 } } })
    ).toThrow();
  });

  it("PROP-V0-1500: validator change throws", () => {
    const pm = new PropsManager();
    const v = (x: any) => !!x;

    pm.define({ a: { kind: "any", validator: v } });

    // same reference ok
    pm.define({ a: { kind: "any", validator: v } });

    // change reference => throw
    expect(() =>
      pm.define({ a: { kind: "any", validator: (x: any) => !!x } })
    ).toThrow();
  });

  it("PROP-V0-1600: default override warns", () => {
    const pm = new PropsManager();
    pm.define({ a: { kind: "number", default: 1 } });

    pm.define({ a: { kind: "number", default: 2 } });
    expect(
      pm
        .getDiagnostics()
        .some(
          (d) =>
            d.level === "warning" &&
            d.key === "a" &&
            d.message.includes("default overridden")
        )
    ).toBe(true);
  });

  it("PROP-V0-1800: failure is atomic (no partial merge applied)", () => {
    const pm = new PropsManager();
    pm.define({
      a: { kind: "number", default: 1 },
      b: { kind: "string", default: "x" },
    });

    // attempt partial update where b fails kind
    expect(() =>
      pm.define({
        a: { kind: "number", default: 2 }, // would warn if applied
        b: { kind: "number" } as any, // error
      })
    ).toThrow();

    // ensure a did not change (still default 1 when missing)
    pm.applyRaw({});
    expect(pm.get().a).toBe(1);
  });
});
