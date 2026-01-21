// packages/module-event/src/impl.ts
import type { ProtoEventCallback, ProtoPhase, RunHandle } from "@proto-ui/core";
import { illegalPhase } from "@proto-ui/core";

import { ModuleBase } from "@proto-ui/module-base";
import type { CapsVaultView } from "@proto-ui/module-base";

import type { EventCaps } from "./types";
import { EventKernel } from "./kernel";
import { EventListenerToken, EventTypeV0 } from "@proto-ui/types";

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
  // Otherwise, allow only dotted-lowercase-ish names for v0 portability.
  // (We do NOT enforce membership in the union at runtime; TS already does that,
  // but runtime may see any string from JS users.)
  return /^[a-z]+(\.[a-z]+)*$/.test(type);
}

export class EventModuleImpl extends ModuleBase<EventCaps> {
  private readonly kernel = new EventKernel();
  private readonly prototypeName: string;

  private lastRun: RunHandle<any> | null = null;
  private isBound = false;

  constructor(caps: CapsVaultView<EventCaps>, prototypeName: string) {
    super(caps);
    this.prototypeName = prototypeName;
  }

  // -------------------------
  // setup-only API (guarded)
  // -------------------------

  private makeToken(id: string): EventListenerToken {
    // stable object; desc() is dev-only side effect
    const token: EventListenerToken = {
      id,
      [Symbol.for("__eventTokenBrand")]: "EventListenerToken",
      desc: (text: string) => {
        // allow call chain in setup only
        this.guardSetupOnly("def.event.token.desc");

        // TODO: remove this in production
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

  on(
    type: EventTypeV0,
    cb: ProtoEventCallback<any>,
    options?: any
  ): EventListenerToken {
    this.guardSetupOnly("def.event.on");
    this.guardArgs(type, cb);

    const id = this.kernel.on("root", type, cb, options);
    return this.makeToken(id);
  }

  onGlobal(
    type: EventTypeV0,
    cb: ProtoEventCallback<any>,
    options?: any
  ): EventListenerToken {
    this.guardSetupOnly("def.event.onGlobal");
    this.guardArgs(type, cb);

    const id = this.kernel.on("global", type, cb, options);
    return this.makeToken(id);
  }

  offToken(token: EventListenerToken) {
    this.guardSetupOnly("def.event.offToken");
    const id = (token as any)?.id;
    if (typeof id !== "string" || !id) {
      throw illegalEventArg(`[Event] invalid token.`, {
        prototypeName: this.prototypeName,
        token,
      });
    }
    this.kernel.offById(id);
  }

  off(
    type: EventTypeV0,
    cb: ProtoEventCallback<any>,
    options?: EventListenerOptions
  ) {
    this.guardSetupOnly("def.event.off");
    this.guardArgs(type, cb);
    this.kernel.off("root", type, cb, options);
  }

  offGlobal(
    type: EventTypeV0,
    cb: ProtoEventCallback<any>,
    options?: EventListenerOptions
  ) {
    this.guardSetupOnly("def.event.offGlobal");
    this.guardArgs(type, cb);
    this.kernel.off("global", type, cb, options);
  }

  // -------------------------
  // runtime port
  // -------------------------

  bind(run: RunHandle<any>) {
    const needsRoot = this.kernel.hasAny("root");
    const needsGlobal = this.kernel.hasAny("global");

    // ✅ v0 contract: no registrations => bind is a no-op
    if (!needsRoot && !needsGlobal) return;

    const root = this.caps.get("getRootTarget")?.();
    if (!root) {
      throw illegalEventTarget(
        `[Event] root target unavailable during bind().`,
        {
          prototypeName: this.prototypeName,
        }
      );
    }

    const global = needsGlobal ? this.caps.get("getGlobalTarget")?.() : null;
    if (needsGlobal && !global) {
      throw illegalEventTarget(
        `[Event] global target unavailable during bind().`,
        {
          prototypeName: this.prototypeName,
        }
      );
    }

    this.lastRun = run;

    this.kernel.bindAll(run, (kind) => (kind === "root" ? root : global!));
    this.isBound = true;
  }

  unbind() {
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
      // contract: auto cleanup on unmount
      this.kernel.cleanupAll();
      this.lastRun = null;
      this.isBound = false;
    }
  }

  protected override onCapsEpoch(_epoch: number): void {
    // Targets might change. If already bound and we have a run handle,
    // rebind immediately to avoid stale listeners.
    if (!this.isBound) return;
    if (!this.lastRun) return;

    // Conservative strategy: unbind everything and bind again.
    // (Keeps registrations, rebuilds wrappers per registration.)
    this.kernel.unbindAll();
    this.isBound = false;

    // Rebind using new caps values.
    this.bind(this.lastRun);
  }

  // -------------------------
  // helpers
  // -------------------------

  private guardSetupOnly(op: string) {
    if (this.protoPhase !== "setup") {
      throw illegalPhase(op, this.protoPhase, {
        prototypeName: this.prototypeName,
        hint: `Register listeners in setup only. Use runtime callbacks for behavior.`,
      });
    }
  }

  private guardArgs(type: EventTypeV0, cb: ProtoEventCallback<any>) {
    if (!isValidEventType(type)) {
      throw illegalEventArg(`[Event] invalid event type: ${String(type)}`, {
        prototypeName: this.prototypeName,
        type,
      });
    }
    if (typeof cb !== "function") {
      throw illegalEventArg(`[Event] callback must be a function.`, {
        prototypeName: this.prototypeName,
        type,
      });
    }
  }
}
