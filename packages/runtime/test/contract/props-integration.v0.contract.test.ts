// packages/runtime/test/contract/props-integration.v0.contract.test.ts
import { describe, it, expect } from "vitest";
import type { PropsBaseType, PropsSpecMap } from "@proto-ui/types";
import { definePrototype } from "@proto-ui/core";
import { executeWithHost } from "../../src/execute/with-host";
import type { RuntimeHost } from "../../src/host";

function createMockHost<P extends PropsBaseType>(
  initialRaw: Record<string, any>
) {
  let raw = { ...(initialRaw ?? {}) };

  const commits: any[] = [];
  const scheduled: Array<() => void> = [];

  const host: RuntimeHost<P> = {
    getRawProps: () => raw,

    commit: (children: any) => {
      commits.push(children);
    },

    schedule: (job: () => void) => {
      scheduled.push(job);
    },

    // optional hooks used by executeWithHost
    onRuntimeReady: () => {},
    onUnmountBegin: () => {},
  } as any;

  const flush = () => {
    while (scheduled.length) {
      const job = scheduled.shift()!;
      job();
    }
  };

  const setHostRaw = (next: Record<string, any>) => {
    raw = { ...(next ?? {}) };
  };

  return { host, commits, flush, setHostRaw };
}

describe("runtime: props integration (v0)", () => {
  it("PROP-RT-0100: hydration does NOT dispatch watchers; second change does", () => {
    type P = { a: number } & PropsBaseType;

    const specs = {
      a: { kind: "number" },
    } satisfies PropsSpecMap<P>;

    const calls: Array<{ tag: string; next: any; prev: any }> = [];

    const Proto = definePrototype<P>({
      name: "rt-props-0100",
      setup: (def) => {
        def.props.define(specs);

        def.props.watch(["a"], (_run, next, prev) => {
          calls.push({
            tag: "resolved:a",
            next: (next as any).a,
            prev: (prev as any).a,
          });
        });

        def.props.watchRaw(["a"], (_run, next, prev) => {
          calls.push({
            tag: "raw:a",
            next: (next as any).a,
            prev: (prev as any).a,
          });
        });

        return (r) => r.el("div", {}, []);
      },
    });

    // ✅ initial raw used by initial hydration (propsPort.applyRaw(host.getRawProps()))
    const { host, flush } = createMockHost<P>({ a: 1 });

    const { controller } = executeWithHost(Proto as any, host as any);

    // mounted callbacks are scheduled; flush them to avoid side effects later
    flush();

    // ✅ contract: hydration does NOT dispatch watchers
    expect(calls).toEqual([]);

    // ✅ second change MUST dispatch watchers (and must NOT render/commit)
    controller.applyRawProps({ a: 2 } as any);

    const tags = calls.map((x) => x.tag);
    expect(tags).toContain("resolved:a");
    expect(tags).toContain("raw:a");

    const resolved = calls.find((x) => x.tag === "resolved:a")!;
    expect(resolved.prev).toBe(1);
    expect(resolved.next).toBe(2);
  });

  it("PROP-RT-0120: raw changes but resolved unchanged => only raw watchers fire", () => {
    type P = { a: number } & PropsBaseType;

    // empty=fallback with no non-empty fallback => resolved becomes null for empty values
    const specs = {
      a: { kind: "number", empty: "fallback" },
    } satisfies PropsSpecMap<P>;

    const calls: string[] = [];

    const Proto = definePrototype<P>({
      name: "rt-props-0120",
      setup: (def) => {
        def.props.define(specs);

        def.props.watch(["a"], () => calls.push("resolved"));
        def.props.watchRaw(["a"], () => calls.push("raw"));

        return (r) => r.el("div", {}, []);
      },
    });

    // initial hydration: provided empty (null) => resolved null
    const { host, flush } = createMockHost<P>({ a: null });

    const { controller } = executeWithHost(Proto as any, host as any);

    flush();

    // ✅ hydration does NOT dispatch watchers
    expect(calls).toEqual([]);

    // Change raw: null -> undefined (still "provided" because key exists)
    // Resolved should remain null, so only raw watchers fire.
    controller.applyRawProps({ a: undefined } as any);

    expect(calls).toEqual(["raw"]);
  });
});
