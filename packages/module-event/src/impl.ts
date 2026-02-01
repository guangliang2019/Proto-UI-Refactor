// packages/module-event/src/impl.ts
import type { ProtoPhase, CapsVaultView } from "@proto-ui/core";
import { illegalPhase } from "@proto-ui/core";

import { ModuleBase } from "@proto-ui/module-base";

import type { EventDispatch } from "./types";
import { EventKernel } from "./kernel";
import { EventListenerToken, EventTypeV0 } from "@proto-ui/types";
import { EVENT_GLOBAL_TARGET_CAP, EVENT_ROOT_TARGET_CAP } from "./caps";

function illegalEventTarget(message: string, detail?: any) {
  const err = new Error(message) as any;
  err.name = "EventTargetUnavailable";
  err.code = "EVENT_TARGET_UNAVAILABLE";
  err.detail = detail;
  return err as Error;
}

function illegalEventArg(message: string, detail?: any) {
  const err = new Error(message) as any;
  err.name = "EventInvalidArgument";
  err.code = "EVENT_INVALID_ARGUMENT";
  err.detail = detail;
  return err as Error;
}

function isValidEventType(type: any): type is EventTypeV0 {
  if (typeof type !== "string" || !type) return false;
  if (type.startsWith("native:")) return type.length > "native:".length;
  if (type.startsWith("host.")) return type.length > "host.".length;
  return /^[a-z]+(\.[a-z]+)*$/.test(type);
}

function isEventTargetLike(x: any): x is EventTarget {
  return (
    !!x &&
    (typeof x === "object" || typeof x === "function") &&
    typeof (x as any).addEventListener === "function" &&
    typeof (x as any).removeEventListener === "function"
  );
}

export class EventModuleImpl extends ModuleBase {
  private readonly kernel = new EventKernel();
  private readonly prototypeName: string;

  private overriddenRootTarget: EventTarget | null = null;

  private lastDispatch: EventDispatch | null = null;
  private isBound = false;

  constructor(caps: CapsVaultView, prototypeName: string) {
    super(caps);
    this.prototypeName = prototypeName;
  }

  // -------------------------
  // setup-only API (guarded)
  // -------------------------

  private ensureSetup(op: string) {
    // Prefer system caps (most precise)
    this.sys?.ensureSetup(op);

    // Fallback: proto-phase based (for tests that don't wire sys)
    if (!this.sys && this.protoPhase !== "setup") {
      throw illegalPhase(op, this.protoPhase, {
        prototypeName: this.prototypeName,
      });
    }
  }

  private ensureRuntime(op: string) {
    this.sys?.ensureRuntime(op);
  }

  private makeToken(id: string): EventListenerToken {
    const token: EventListenerToken = {
      id,
      [Symbol.for("__eventTokenBrand")]: "EventListenerToken",
      desc: (text: string) => {
        this.ensureSetup("def.event.token.desc");

        const __DEV__ = true;
        if (__DEV__) {
          if (typeof text === "string" && text.trim()) {
            this.kernel.setLabel(id, text.trim());
          }
        }
        return token;
      },
    } as any;
    return token;
  }

  redirectRoot(target: EventTarget) {
    this.ensureSetup("def.event.redirectRoot");
    if (!isEventTargetLike(target)) {
      throw illegalEventArg(
        `[Event] redirectRoot() requires an EventTarget-like object.`,
        { prototypeName: this.prototypeName, target }
      );
    }
    this.overriddenRootTarget = target;
  }

  on(type: EventTypeV0, options?: any): EventListenerToken {
    this.ensureSetup("def.event.on");
    this.guardArgs(type);
    const id = this.kernel.on("root", type, options);
    return this.makeToken(id);
  }

  onGlobal(type: EventTypeV0, options?: any): EventListenerToken {
    this.ensureSetup("def.event.onGlobal");
    this.guardArgs(type);
    const id = this.kernel.on("global", type, options);
    return this.makeToken(id);
  }

  offToken(token: EventListenerToken) {
    this.ensureSetup("def.event.offToken");
    const id = (token as any)?.id;
    if (typeof id !== "string" || !id) {
      throw illegalEventArg(`[Event] invalid token.`, {
        prototypeName: this.prototypeName,
        token,
      });
    }
    this.kernel.offById(id);
  }

  offLatest(kind: "root" | "global", type: EventTypeV0, options?: any) {
    this.ensureSetup("def.event.offLatest");
    if (kind !== "root" && kind !== "global") {
      throw illegalEventArg(
        `[Event] invalid kind for offLatest: ${String(kind)}`,
        { prototypeName: this.prototypeName, kind }
      );
    }
    this.guardArgs(type);
    this.kernel.offLatest(kind, type, options);
  }

  // -------------------------
  // runtime port
  // -------------------------

  bind(dispatch: EventDispatch) {
    this.ensureRuntime("rt.event.bind");

    const needsRoot = this.kernel.hasAny("root");
    const needsGlobal = this.kernel.hasAny("global");

    // v0 contract: no registrations => no-op (must not read targets)
    if (!needsRoot && !needsGlobal) return;

    const rootGetter = this.caps.has(EVENT_ROOT_TARGET_CAP)
      ? this.caps.get(EVENT_ROOT_TARGET_CAP)
      : undefined;

    const globalGetter = this.caps.has(EVENT_GLOBAL_TARGET_CAP)
      ? this.caps.get(EVENT_GLOBAL_TARGET_CAP)
      : undefined;

    const root = this.overriddenRootTarget ?? rootGetter?.() ?? null;

    if (needsRoot && !root) {
      throw illegalEventTarget(
        `[Event] root target unavailable during bind().`,
        { prototypeName: this.prototypeName }
      );
    }

    const global = needsGlobal ? globalGetter?.() ?? null : null;
    if (needsGlobal && !global) {
      throw illegalEventTarget(
        `[Event] global target unavailable during bind().`,
        { prototypeName: this.prototypeName }
      );
    }

    this.lastDispatch = dispatch;

    this.kernel.bindAll(dispatch, (kind) =>
      kind === "root" ? (root as EventTarget) : (global as EventTarget)
    );
    this.isBound = true;
  }

  unbind() {
    this.ensureRuntime("rt.event.unbind");
    this.kernel.unbindAll();
    this.isBound = false;
  }

  getDiagnostics() {
    return this.kernel.snapshot();
  }

  // -------------------------
  // lifecycle + caps wiring
  // -------------------------

  override onProtoPhase(phase: ProtoPhase): void {
    super.onProtoPhase(phase);

    if (phase === "unmounted") {
      this.kernel.cleanupAll();
      this.lastDispatch = null;
      this.isBound = false;
      this.overriddenRootTarget = null;
    }
  }

  protected override onCapsEpoch(_epoch: number): void {
    // Targets might change. If already bound and we have a dispatch,
    // rebind immediately to avoid stale listeners.
    if (!this.isBound) return;
    if (!this.lastDispatch) return;

    this.kernel.unbindAll();
    this.isBound = false;

    this.bind(this.lastDispatch);
  }

  // -------------------------
  // helpers
  // -------------------------

  private guardArgs(type: EventTypeV0) {
    if (!isValidEventType(type)) {
      throw illegalEventArg(`[Event] invalid event type: ${String(type)}`, {
        prototypeName: this.prototypeName,
        type,
      });
    }
  }
}
