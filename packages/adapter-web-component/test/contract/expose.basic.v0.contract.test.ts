import { describe, it, expect } from "vitest";
import type { Prototype } from "@proto-ui/core";
import { AdaptToWebComponent } from "@proto-ui/adapter-web-component";

describe("expose contract (adapter-web-component)", () => {
  it("getExposes returns a record snapshot", () => {
    const P: Prototype = {
      name: "x-expose-basic",
      setup(def) {
        def.expose("api", { ping: () => "pong" });
        def.expose("num", 1);
        return (r) => [r.el("div", "ok")];
      },
    };

    AdaptToWebComponent(P);

    const el = document.createElement("x-expose-basic") as any;
    document.body.appendChild(el);

    const snapshot = el.getExposes();
    expect(snapshot).toEqual({
      api: { ping: expect.any(Function) },
      num: 1,
    });

    // snapshot should be detached from internal storage
    snapshot.extra = 123;
    const again = el.getExposes();
    expect(again.extra).toBeUndefined();
  });

  it("dispose clears exposes snapshot", () => {
    const P: Prototype = {
      name: "x-expose-dispose",
      setup(def) {
        def.expose("api", { version: 1 });
        return (r) => [r.el("div", "ok")];
      },
    };

    AdaptToWebComponent(P);

    const el = document.createElement("x-expose-dispose") as any;
    document.body.appendChild(el);

    expect(el.getExposes()).toEqual({ api: { version: 1 } });

    document.body.removeChild(el);

    expect(el.getExposes()).toEqual({});
  });
});
