// packages/runtime/test/contracts/lifecycle-with-host.v0.contract.test.ts
import { describe, it, expect } from "vitest";
import type { Prototype, TemplateChildren } from "@proto-ui/core";
import { executeWithHost } from "../../src/execute";
import type { RuntimeHost } from "../../src/host";

// If runtime/src/index.ts does NOT re-export core types, then use:
// import type { Prototype, TemplateChildren } from "@proto-ui/core";
// but you said you'd prefer not to depend on workspace alias here.

function createMockHost() {
  const calls: string[] = [];
  const scheduled: Array<() => void> = [];
  const commits: TemplateChildren[] = [];

  // Minimal RunHandle / RenderRead: runtime will override props anyway.
  const run = {
    update: () => {},
    props: {
      get: () => ({}),
      getRaw: () => ({}),
      isProvided: (_k: string) => false,
    },
    context: {
      read: (_k: any) => {
        throw new Error("[test] context.read not provided");
      },
      tryRead: (_k: any) => undefined,
    },
    state: {
      read: (_id: any) => {
        throw new Error("[test] state.read not provided");
      },
    },
  };

  const host: RuntimeHost<any> = {
    prototypeName: "test-proto",

    getRawProps() {
      return {};
    },

    commit(children) {
      calls.push("commit");
      commits.push(children);
    },

    schedule(task) {
      calls.push("schedule-mounted");
      scheduled.push(task);
    },
  };

  return { host, calls, scheduled, commits, run };
}

describe("runtime contract: lifecycle-with-host (v0)", () => {
  it("created happens before first commit; mounted happens after first commit (host-scheduled)", () => {
    const { host, calls, scheduled } = createMockHost();

    const P: Prototype = {
      name: "x-runtime-life-1",
      setup(def) {
        def.lifecycle.onCreated(() => calls.push("created"));
        def.lifecycle.onMounted(() => calls.push("mounted"));
        return (r) => [r.el("div", "ok")];
      },
    };

    executeWithHost(P, host);

    // created before initial commit
    const createdIndex = calls.indexOf("created");
    const commitIndex = calls.indexOf("commit");
    expect(createdIndex).toBeGreaterThanOrEqual(0);
    expect(commitIndex).toBeGreaterThanOrEqual(0);
    expect(createdIndex).toBeLessThan(commitIndex);

    // mounted not yet executed; only scheduled
    expect(calls.includes("mounted")).toBe(false);
    expect(scheduled.length).toBe(1);

    // flush scheduled mounted
    scheduled[0]();
    expect(calls.includes("mounted")).toBe(true);

    const mountedIndex = calls.indexOf("mounted");
    expect(commitIndex).toBeLessThan(mountedIndex);
  });

  it("update() triggers a commit(update) then updated callback (ordering constraint)", () => {
    const { host, calls, scheduled, run } = createMockHost();
    // ensure mounted doesn't interfere in this test unless we flush it
    const P: Prototype = {
      name: "x-runtime-life-2",
      setup(def) {
        def.lifecycle.onUpdated(() => calls.push("updated"));
        return (r) => [r.el("div", "v")];
      },
    };

    const { controller } = executeWithHost(P, host);

    // clear initial calls (we only care about update cycle ordering)
    calls.length = 0;

    controller.update();

    const commitIndex = calls.indexOf("commit");
    const updatedIndex = calls.indexOf("updated");

    expect(commitIndex).toBeGreaterThanOrEqual(0);
    expect(updatedIndex).toBeGreaterThanOrEqual(0);
    expect(commitIndex).toBeLessThan(updatedIndex);

    // mounted is host-scheduled by executeWithHost initial run; ignore unless flushed
    // (if you want strict separation, you can flush scheduled here)
    for (const task of scheduled) task();
    void run; // silence unused if your TS config complains
  });

  it("unmounted is invoked when adapter calls invokeUnmounted()", () => {
    const { host, calls } = createMockHost();

    const P: Prototype = {
      name: "x-runtime-life-3",
      setup(def) {
        def.lifecycle.onUnmounted(() => calls.push("unmounted"));
        return (r) => [r.el("div", "ok")];
      },
    };

    const { invokeUnmounted } = executeWithHost(P, host);

    expect(calls.includes("unmounted")).toBe(false);
    invokeUnmounted();
    expect(calls.includes("unmounted")).toBe(true);
  });
});
