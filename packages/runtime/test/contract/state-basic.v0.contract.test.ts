// packages/runtime/test/contract/state-basic.v0.contract.test.ts
import { describe, it, expect } from "vitest";
import type { Prototype, OwnedStateHandle } from "@proto-ui/core";
import { executeWithHost } from "../../src/execute";
import type { RuntimeHost } from "../../src/host";

/**
 * Runtime Contract (v0): state basic semantics (no asHook/event/expose)
 *
 * v0 working assumptions (aligned with current kernel tests):
 * - def.state.* is setup-only (creation is setup-only)
 * - OwnedStateHandle.get/setDefault/set exist
 * - setDefault does NOT emit (kernel guarantee)
 * - set MAY be called in setup, but v0 does not require it to throw
 * - state changes do NOT trigger render automatically
 * - created runs before first commit, so created-time set is visible to initial render
 * - after unmount+dispose, state handle becomes unusable (guarded by __sys in module layer)
 */
describe("runtime contract: state basic (v0)", () => {
  it("setDefault works in setup and affects created+initial render; set in setup is allowed in v0", () => {
    const logs: string[] = [];

    const host: RuntimeHost<any> = {
      prototypeName: "x-runtime-state-basic",
      getRawProps() {
        return {};
      },
      commit() {},
      schedule(task) {
        task();
      },
    };

    let s!: OwnedStateHandle<boolean>;

    const P: Prototype = {
      name: "x-runtime-state-basic",
      setup(def) {
        s = def.state.bool("open", false);

        // setup: setDefault ok
        s.setDefault(true);

        // v0: set in setup is not allowed.
        expect(() => s.set(false)).toThrow();

        def.lifecycle.onCreated(() => {
          logs.push(`created:${String(s.get())}`);
        });

        return (r) => {
          logs.push(`render:${String(s.get())}`);
          return [r.el("div", "ok")];
        };
      },
    };

    executeWithHost(P, host);

    // By the time created runs and initial render happens, s.get() reflects the last setup-time mutation.
    // (If later you decide to forbid setup-time set, update this contract + module facade guard.)
    expect(logs).toEqual(["created:true", "render:true"]);
  });

  it("set in created is visible to initial render; set after mount does not re-render until update()", () => {
    const commits: Array<string> = [];
    const scheduled: Array<() => void> = [];

    const host: RuntimeHost<any> = {
      prototypeName: "x-runtime-state-update",
      getRawProps() {
        return {};
      },
      commit(children) {
        commits.push(`commit:${Array.isArray(children) ? children.length : 0}`);
      },
      schedule(task) {
        scheduled.push(task);
      },
    };

    let s!: OwnedStateHandle<number>;
    let controller!: { update(): void };

    const P: Prototype = {
      name: "x-runtime-state-update",
      setup(def) {
        s = def.state.numberDiscrete("count", 0, {});

        def.lifecycle.onCreated(() => {
          s.set(1);
        });

        def.lifecycle.onMounted(() => {
          s.set(2);
          // intentionally NOT calling run.update()
        });

        return (r) => {
          const n = s.get();
          return Array.from({ length: n }, () => r.r.slot());
        };
      },
    };

    const ret = executeWithHost(P, host);
    controller = ret.controller;

    // initial render should see created-time set(1)
    expect(commits).toEqual(["commit:1"]);

    // mounted set(2) must NOT auto commit
    expect(scheduled.length).toBe(1);
    scheduled[0]();
    expect(commits).toEqual(["commit:1"]);

    // explicit update commits
    controller.update();
    expect(commits).toEqual(["commit:1", "commit:2"]);
  });

  it("state handles become unusable after unmount+dispose (module guard responsibility)", () => {
    const host: RuntimeHost<any> = {
      prototypeName: "x-runtime-state-dispose",
      getRawProps() {
        return {};
      },
      commit() {},
      schedule(task) {
        task();
      },
      onUnmountBegin() {},
    };

    let s!: OwnedStateHandle<boolean>;

    const P: Prototype = {
      name: "x-runtime-state-dispose",
      setup(def) {
        s = def.state.bool("alive", true);

        def.lifecycle.onUnmounted(() => {
          // during unmounted callback, still usable
          expect(() => s.get()).not.toThrow();
          expect(() => s.set(false)).not.toThrow();
        });

        return (r) => [r.el("div", "ok")];
      },
    };

    const { invokeUnmounted } = executeWithHost(P, host);
    invokeUnmounted();

    // After dispose, must throw if module facade uses __sys.ensureNotDisposed.
    // If this currently doesn't throw, it means state-module hasn't wired __sys guards yet.
    expect(() => s.get()).toThrow();
    expect(() => s.set(true)).toThrow();
    expect(() => s.setDefault(true)).toThrow();
  });
});
