// internal/specimens/specimens.ts

import {
  asPrototypeRef,
  type Prototype,
  type TemplateNode,
  type TemplateChildren,
} from "@proto-ui/core"; // 如果后面改成 workspace 引用，这里再调整
import { executePrototype } from "@proto-ui/runtime";

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`[Specimen] Assertion failed: ${msg}`);
}

function assertThrows(fn: () => any, contains: string) {
  let ok = false;
  try {
    fn();
  } catch (e: any) {
    ok = String(e?.message ?? e).includes(contains);
  }
  if (!ok) throw new Error(`[Specimen] Expected throw containing: ${contains}`);
}

function isNode(x: any): x is TemplateNode {
  return x && typeof x === "object" && "type" in x;
}

function runAll() {
  // template/boolean-child-illegal
  {
    const P: Prototype = {
      name: "boolean-child-illegal",
      setup(def) {
        // @ts-expect-error - boolean child is illegal
        return (r) => [r.el("div", false)];
      },
    };
    assertThrows(() => executePrototype(P), `boolean child is illegal`);
  }

  // template/null-undefined-filtering (undefined illegal, null empty)
  {
    const P1: Prototype = {
      name: "undefined-child-illegal",
      setup(def) {
        // @ts-expect-error - undefined child is illegal
        return (r) => [r.el("div", [undefined])];
      },
    };
    assertThrows(() => executePrototype(P1), `undefined child is illegal`);

    const P2: Prototype = {
      name: "null-is-empty",
      setup(def) {
        return (r) => [r.el("div", [null, "x", null])];
      },
    };
    const res = executePrototype(P2);
    const children = res.children as any[];
    assert(Array.isArray(children), "root children should be array");
    const div = children[0];
    assert(isNode(div), "first child should be node");
    // div.children should be 'x' (null filtered, single child collapsed)
    assert((div as any).children === "x", "null should be filtered out");
  }

  // prototype/setup-returns-void-default-slot
  {
    const P: Prototype = {
      name: "default-slot",
      setup(def) {
        // no render returned
      },
    };
    const res = executePrototype(P);
    const c = res.children;
    assert(
      Array.isArray(c),
      "default slot render should return children array"
    );
    const slot = (c as any[])[0];
    assert(isNode(slot), "slot should be a node");
    assert(
      (slot as any).type?.kind === "slot",
      "default render should be slot node"
    );
  }

  // prototype/nested-prototype-template
  {
    const Child: Prototype = {
      name: "child",
      setup() {
        return (r) => [r.el("span", "c")];
      },
    };
    const Parent: Prototype = {
      name: "parent",
      setup() {
        return (r) => [r.el(asPrototypeRef(Child), null)];
      },
    };
    const res = executePrototype(Parent);
    const first = (res.children as any[])[0];
    assert(isNode(first), "first should be node");
    const t = (first as any).type;
    assert(
      t?.kind === "prototype" && t?.name === "child",
      "prototype ref type expected"
    );
  }

  // handles/def-illegal-after-setup (def usage inside callback should throw)
  {
    const P: Prototype = {
      name: "def-illegal-after-setup",
      setup(def) {
        def.lifecycle.onCreated((_run) => {
          // illegal: using def in callback phase
          (def as any).state.define("x");
        });
        return (r) => null;
      },
    };
    const res = executePrototype(P);
    assertThrows(() => res.invoke("created"), `illegal call: def.state.define`);
  }

  console.log(`All specimens passed.`);
}

runAll();
