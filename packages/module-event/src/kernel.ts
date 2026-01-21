// packages/module-event/src/kernel.ts
import { EventTypeV0 } from "@proto-ui/types";
import type { EventDiag } from "./types";
import { ProtoEventCallback } from "@proto-ui/core";

type TargetKind = "root" | "global";

type Reg = {
  id: string;
  debugLabel?: string; // dev-only

  kind: TargetKind;
  type: EventTypeV0;
  cb: ProtoEventCallback<any>;
  options?: EventListenerOptions;

  wrapper?: (ev: any) => void;
  boundTarget?: EventTarget;
};

function isPlainObject(x: any): x is Record<string, any> {
  return (
    !!x &&
    typeof x === "object" &&
    (x.constructor === Object || x.constructor == null)
  );
}

function sameOptions(a: any, b: any) {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;

  // Primitive-ish compare
  if (typeof a !== "object" || typeof b !== "object") return false;

  // Shallow object compare (v0 pragmatic)
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!Object.is(a[k], b[k])) return false;
    }
    return true;
  }

  // Fallback: strict identity for non-plain objects (AbortSignal, etc.)
  return false;
}

function matchReg(
  r: Reg,
  type: EventTypeV0,
  cb: ProtoEventCallback<any>,
  options?: any
) {
  return r.type === type && r.cb === cb && sameOptions(r.options, options);
}

export class EventKernel {
  private regs: Reg[] = [];
  private seq = 0;

  private nextId() {
    this.seq++;
    return `ev_${this.seq}`;
  }

  on(
    kind: TargetKind,
    type: EventTypeV0,
    cb: ProtoEventCallback<any>,
    options?: any
  ) {
    const id = this.nextId();
    this.regs.push({ id, kind, type, cb, options });
    return id;
  }

  offById(id: string) {
    for (let i = this.regs.length - 1; i >= 0; i--) {
      const r = this.regs[i]!;
      if (r.id !== id) continue;

      if (r.wrapper && r.boundTarget) {
        r.boundTarget.removeEventListener(
          r.type as any,
          r.wrapper as any,
          r.options as any
        );
      }

      this.regs.splice(i, 1);
      return true;
    }
    return false;
  }

  setLabel(id: string, label: string) {
    for (let i = this.regs.length - 1; i >= 0; i--) {
      const r = this.regs[i]!;
      if (r.id !== id) continue;
      r.debugLabel = label;
      return true;
    }
    return false;
  }

  /**
   * Remove ONE matching registration (latest-first).
   * If bound, it detaches immediately.
   */
  off(
    kind: TargetKind,
    type: EventTypeV0,
    cb: ProtoEventCallback<any>,
    options?: any
  ) {
    for (let i = this.regs.length - 1; i >= 0; i--) {
      const r = this.regs[i]!;
      if (r.kind !== kind) continue;
      if (!matchReg(r, type, cb, options)) continue;

      if (r.wrapper && r.boundTarget) {
        r.boundTarget.removeEventListener(
          r.type as any,
          r.wrapper as any,
          r.options as any
        );
      }

      this.regs.splice(i, 1);
      return true;
    }
    return false;
  }

  bindAll(run: any, getTarget: (kind: TargetKind) => EventTarget) {
    for (const r of this.regs) {
      if (r.wrapper && r.boundTarget) continue; // already bound

      const target = getTarget(r.kind);

      // unique wrapper per registration to avoid host dedupe
      const wrapper = (ev: any) => r.cb(run, ev);

      target.addEventListener(r.type as any, wrapper as any, r.options as any);

      r.wrapper = wrapper;
      r.boundTarget = target;
    }
  }

  unbindAll() {
    for (const r of this.regs) {
      if (!r.wrapper || !r.boundTarget) continue;
      r.boundTarget.removeEventListener(
        r.type as any,
        r.wrapper as any,
        r.options as any
      );
      r.wrapper = undefined;
      r.boundTarget = undefined;
    }
  }

  /** unbind + drop registrations */
  cleanupAll() {
    this.unbindAll();
    this.regs.length = 0;
  }

  snapshot(): readonly EventDiag[] {
    return this.regs.map((r) => ({
      id: r.id,
      kind: r.kind,
      type: String(r.type),
      bound: !!r.boundTarget && !!r.wrapper,
      label: r.debugLabel,
    }));
  }

  hasAny(kind: TargetKind) {
    return this.regs.some((r) => r.kind === kind);
  }
}
