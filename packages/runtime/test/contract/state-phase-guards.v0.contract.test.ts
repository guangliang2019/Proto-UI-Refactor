// packages/runtime/test/contract/state-phase-guards.v0.contract.test.ts
import { describe, it, expect } from "vitest";
import type { Prototype, OwnedStateHandle } from "@proto-ui/core";
import { executeWithHost } from "../../src/execute";
import type { RuntimeHost } from "../../src/host";

/**
 * Runtime Contract (v0): phase guards for OwnedStateHandle APIs
 *
 * v0 alignment with current kernel:
 * - Owned handle does NOT require runtime-only set.
 * - Therefore, we only assert guards that are meaningful now:
 *   - setDefault should be allowed in setup (setup-only is a policy; kernel allows it anytime, but we treat it as setup-intent)
 *
 * If you later decide to add real guards in module facade (recommended),
 * flip this contract back to "set throws in setup / setDefault throws in runtime".
 */
describe("runtime contract: state phase guards (v0)", () => {
  it("v0: set is allowed in setup; setDefault is allowed in setup; both usable in created", () => {
    const host: RuntimeHost<any> = {
      prototypeName: "x-runtime-state-guards",
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
      name: "x-runtime-state-guards",
      setup(def) {
        s = def.state.bool("open", false);

        expect(() => s.set(true)).toThrow();
        expect(() => s.setDefault(false)).not.toThrow();

        def.lifecycle.onCreated(() => {
          expect(() => s.setDefault(true)).toThrow();
          expect(() => s.set(true)).not.toThrow();
        });

        return (r) => [r.el("div", "ok")];
      },
    };

    executeWithHost(P, host);
  });
});
