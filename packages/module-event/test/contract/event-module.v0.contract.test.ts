// packages/module-event/test/contracts/event-module.v0.contract.test.ts
import { describe, it, expect } from "vitest";
import { EventModuleImpl } from "../../src/impl";

type ExecPhase = "setup" | "render" | "callback" | "unknown";
type ProtoPhase = "setup" | "mounted" | "updated" | "unmounted"; // enough for tests

function createMockTarget(label: string) {
  type Rec = { type: string; fn: any; options: any };
  const listeners: Rec[] = [];

  const target: EventTarget & {
    __label: string;
    __listeners: Rec[];
    __fire: (type: string, ev?: any) => void;
    __count: (type?: string) => number;
  } = {
    __label: label,
    __listeners: listeners,
    addEventListener(type: any, fn: any, options: any) {
      listeners.push({ type: String(type), fn, options });
    },
    removeEventListener(type: any, fn: any, options: any) {
      const t = String(type);
      for (let i = listeners.length - 1; i >= 0; i--) {
        const r = listeners[i]!;
        if (r.type !== t) continue;
        if (r.fn !== fn) continue;
        // v0: we don't require deep equality here; impl passes exact same options ref
        // so strict identity is enough to remove.
        if (r.options !== options) continue;
        listeners.splice(i, 1);
        return;
      }
    },
    dispatchEvent(_evt: Event) {
      return true;
    },
    __fire(type: string, ev: any = { type }) {
      // fire snapshot to avoid issues if handlers remove themselves
      const snapshot = listeners.filter((r) => r.type === type).slice();
      for (const r of snapshot) r.fn(ev);
    },
    __count(type?: string) {
      return type
        ? listeners.filter((r) => r.type === type).length
        : listeners.length;
    },
  };

  return target;
}

function createSysCaps() {
  let execPhase: ExecPhase = "setup";
  let protoPhase: ProtoPhase = "setup";
  let disposed = false;

  const sys = {
    execPhase: () => execPhase,
    domain: () => (execPhase === "setup" ? "setup" : "runtime"),
    protoPhase: () => protoPhase,
    isDisposed: () => disposed,

    ensureNotDisposed(op: string) {
      if (disposed) throw new Error(`[Disposed] ${op}`);
    },

    ensureExecPhase(op: string, expected: ExecPhase | ExecPhase[]) {
      const list = Array.isArray(expected) ? expected : [expected];
      if (!list.includes(execPhase)) {
        const e = new Error(
          `[Phase] ${op} expected ${list.join("|")} got ${execPhase}`
        ) as any;
        e.code = "EVENT_PHASE_VIOLATION";
        throw e;
      }
    },

    ensureSetup(op: string) {
      if (execPhase !== "setup") {
        const e = new Error(
          `[Phase] ${op} setup-only, got ${execPhase}`
        ) as any;
        e.code = "EVENT_PHASE_VIOLATION";
        throw e;
      }
    },

    ensureRuntime(op: string) {
      if (execPhase === "setup") {
        const e = new Error(`[Phase] ${op} runtime-only, got setup`) as any;
        e.code = "EVENT_PHASE_VIOLATION";
        throw e;
      }
    },

    ensureCallback(op: string) {
      if (execPhase !== "callback") {
        const e = new Error(
          `[Phase] ${op} callback-only, got ${execPhase}`
        ) as any;
        e.code = "EVENT_PHASE_VIOLATION";
        throw e;
      }
    },

    // test controls
    __setExecPhase(p: ExecPhase) {
      execPhase = p;
    },
    __setProtoPhase(p: ProtoPhase) {
      protoPhase = p;
    },
    __dispose() {
      disposed = true;
    },
  };

  return sys;
}

function createCapsVault(args: {
  sys: any;
  getRootTarget?: () => EventTarget | null;
  getGlobalTarget?: () => EventTarget | null;
}) {
  const map: Record<string, any> = {
    __sys: args.sys,
    getRootTarget: args.getRootTarget,
    getGlobalTarget: args.getGlobalTarget,
  };

  let epoch = 0;
  const listeners = new Set<(epoch: number) => void>();

  return {
    get(key: string) {
      return map[key];
    },

    onChange(cb: (epoch: number) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    // test helper to mutate caps (simulate epoch changes)
    __set(key: string, val: any) {
      map[key] = val;
    },

    __bumpEpoch() {
      epoch++;
      for (const cb of listeners) cb(epoch);
    },
  };
}

describe("event-module: contract v0 (module semantics)", () => {
  it("EV-MOD-V0-1000: bind() with no registrations MUST be no-op and MUST NOT read targets", () => {
    const sys = createSysCaps();
    sys.__setExecPhase("render"); // runtime

    const caps = createCapsVault({
      sys,
      getRootTarget: () => {
        throw new Error("should not read root target");
      },
      getGlobalTarget: () => {
        throw new Error("should not read global target");
      },
    });

    const impl = new EventModuleImpl(caps as any, "test-proto");

    expect(() => impl.bind(() => {})).not.toThrow();
  });

  it("EV-MOD-V0-1100: root target required only if root registrations exist", () => {
    const sys = createSysCaps();

    const caps = createCapsVault({
      sys,
      getRootTarget: () => null,
      getGlobalTarget: () => null,
    });

    const impl = new EventModuleImpl(caps as any, "test-proto");

    // setup: register root listener
    sys.__setExecPhase("setup");
    impl.on("native:click" as any);

    // runtime: bind => should throw missing root target
    sys.__setExecPhase("render");
    expect(() => impl.bind(() => {})).toThrow(/root target unavailable/i);
  });

  it("EV-MOD-V0-1200: global target required only if global registrations exist", () => {
    const sys = createSysCaps();
    const root = createMockTarget("root");

    const caps = createCapsVault({
      sys,
      getRootTarget: () => root,
      getGlobalTarget: () => null,
    });

    const impl = new EventModuleImpl(caps as any, "test-proto");

    // setup: only global reg
    sys.__setExecPhase("setup");
    impl.onGlobal("native:keydown" as any);

    // runtime: bind => should throw missing global target, but not complain about root
    sys.__setExecPhase("render");
    expect(() => impl.bind(() => {})).toThrow(/global target unavailable/i);
  });

  it("EV-MOD-V0-1300: firing host event MUST call dispatch(id, ev) for each registration", () => {
    const sys = createSysCaps();
    const root = createMockTarget("root");

    const caps = createCapsVault({
      sys,
      getRootTarget: () => root,
      getGlobalTarget: () => null,
    });

    const impl = new EventModuleImpl(caps as any, "test-proto");

    sys.__setExecPhase("setup");
    const token = impl.on("native:click" as any);

    const calls: any[] = [];
    const dispatch = (id: string, ev: any) => calls.push([id, ev]);

    sys.__setExecPhase("render");
    impl.bind(dispatch);

    expect(root.__count("native:click")).toBe(1);

    root.__fire("native:click", { type: "native:click", x: 1 });

    expect(calls.length).toBe(1);
    expect(calls[0]![0]).toBe((token as any).id);
    expect(calls[0]![1]).toMatchObject({ type: "native:click", x: 1 });
  });

  it("EV-MOD-V0-1400: offToken() MUST detach immediately if currently bound", () => {
    const sys = createSysCaps();
    const root = createMockTarget("root");

    const caps = createCapsVault({
      sys,
      getRootTarget: () => root,
      getGlobalTarget: () => null,
    });

    const impl = new EventModuleImpl(caps as any, "test-proto");

    sys.__setExecPhase("setup");
    const token = impl.on("native:click" as any);

    const calls: any[] = [];
    sys.__setExecPhase("render");
    impl.bind((id, ev) => calls.push([id, ev]));

    expect(root.__count("native:click")).toBe(1);

    // setup-only removal
    sys.__setExecPhase("setup");
    impl.offToken(token);

    expect(root.__count("native:click")).toBe(0);

    // even if fired, nothing happens
    root.__fire("native:click", { type: "native:click" });
    expect(calls.length).toBe(0);
  });

  it("EV-MOD-V0-1500: unbind() MUST detach but keep registrations; subsequent bind MUST reattach", () => {
    const sys = createSysCaps();
    const root = createMockTarget("root");

    const caps = createCapsVault({
      sys,
      getRootTarget: () => root,
      getGlobalTarget: () => null,
    });

    const impl = new EventModuleImpl(caps as any, "test-proto");

    sys.__setExecPhase("setup");
    const token = impl.on("native:click" as any);

    const calls: any[] = [];
    const dispatch = (id: string, ev: any) => calls.push([id, ev]);

    sys.__setExecPhase("render");
    impl.bind(dispatch);
    expect(root.__count("native:click")).toBe(1);

    impl.unbind();
    expect(root.__count("native:click")).toBe(0);

    // bind again should reattach
    impl.bind(dispatch);
    expect(root.__count("native:click")).toBe(1);

    root.__fire("native:click", { type: "native:click" });
    expect(calls.length).toBe(1);
    expect(calls[0]![0]).toBe((token as any).id);
  });

  it("EV-MOD-V0-1600: onCapsEpoch() MUST rebind to new targets when bound", () => {
    const sys = createSysCaps();
    const rootA = createMockTarget("rootA");
    const rootB = createMockTarget("rootB");

    const caps = createCapsVault({
      sys,
      getRootTarget: () => rootA,
      getGlobalTarget: () => null,
    });

    const impl = new EventModuleImpl(caps as any, "test-proto");

    sys.__setExecPhase("setup");
    const token = impl.on("native:click" as any);

    const calls: any[] = [];
    const dispatch = (id: string, ev: any) => calls.push([id, ev]);

    sys.__setExecPhase("render");
    impl.bind(dispatch);

    expect(rootA.__count("native:click")).toBe(1);
    expect(rootB.__count("native:click")).toBe(0);

    caps.__set("getRootTarget", () => rootB);
    caps.__bumpEpoch();

    expect(rootA.__count("native:click")).toBe(0);
    expect(rootB.__count("native:click")).toBe(1);

    rootB.__fire("native:click", { type: "native:click", y: 2 });
    expect(calls.length).toBe(1);
    expect(calls[0]![0]).toBe((token as any).id);
  });

  it("EV-MOD-V0-1700: redirectRoot() in setup MUST override caps root target; calling after setup MUST throw", () => {
    const sys = createSysCaps();
    const capRoot = createMockTarget("capRoot");
    const redirected = createMockTarget("redirected");

    const caps = createCapsVault({
      sys,
      getRootTarget: () => capRoot,
      getGlobalTarget: () => null,
    });

    const impl = new EventModuleImpl(caps as any, "test-proto");

    sys.__setExecPhase("setup");
    impl.redirectRoot(redirected);
    const token = impl.on("native:click" as any);

    const calls: any[] = [];
    sys.__setExecPhase("render");
    impl.bind((id, ev) => calls.push([id, ev]));

    expect(capRoot.__count("native:click")).toBe(0);
    expect(redirected.__count("native:click")).toBe(1);

    redirected.__fire("native:click", { type: "native:click" });
    expect(calls.length).toBe(1);
    expect(calls[0]![0]).toBe((token as any).id);

    // after setup: redirectRoot must throw
    sys.__setExecPhase("render");
    expect(() => impl.redirectRoot(createMockTarget("late"))).toThrow();
  });

  it("EV-MOD-V0-1800: unmounted MUST cleanup (unbind + drop registrations)", () => {
    const sys = createSysCaps();
    const root = createMockTarget("root");

    const caps = createCapsVault({
      sys,
      getRootTarget: () => root,
      getGlobalTarget: () => null,
    });

    const impl = new EventModuleImpl(caps as any, "test-proto");

    sys.__setExecPhase("setup");
    impl.on("native:click" as any);

    const calls: any[] = [];
    sys.__setExecPhase("render");
    impl.bind((id, ev) => calls.push([id, ev]));
    expect(root.__count("native:click")).toBe(1);

    // lifecycle unmount
    (impl as any).onProtoPhase("unmounted");
    expect(root.__count("native:click")).toBe(0);

    // After cleanup, bind should be no-op even if caps would throw
    caps.__set("getRootTarget", () => {
      throw new Error("should not read targets after cleanup");
    });

    expect(() => impl.bind(() => {})).not.toThrow();
    root.__fire("native:click", { type: "native:click" });
    expect(calls.length).toBe(0);
  });

  it("EV-MOD-V0-1900: setup-only APIs MUST throw in runtime execPhase", () => {
    const sys = createSysCaps();
    const root = createMockTarget("root");

    const caps = createCapsVault({
      sys,
      getRootTarget: () => root,
      getGlobalTarget: () => null,
    });

    const impl = new EventModuleImpl(caps as any, "test-proto");

    sys.__setExecPhase("render");
    expect(() => impl.on("native:click" as any)).toThrow();
    expect(() => impl.onGlobal("native:keydown" as any)).toThrow();
  });

  it("EV-MOD-V0-1950: runtime-only APIs MUST throw in setup execPhase", () => {
    const sys = createSysCaps();
    const root = createMockTarget("root");

    const caps = createCapsVault({
      sys,
      getRootTarget: () => root,
      getGlobalTarget: () => null,
    });

    const impl = new EventModuleImpl(caps as any, "test-proto");

    sys.__setExecPhase("setup");
    expect(() => impl.bind(() => {})).toThrow();
    expect(() => impl.unbind()).toThrow();
  });
});
