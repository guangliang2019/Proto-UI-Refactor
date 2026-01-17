// packages/module-props/src/impl.ts
import type {
  PropsDefaults,
  PropsSnapshot,
  PropsWatchCallback,
  RawWatchCallback,
  RunHandle,
} from "@proto-ui/core";
import type { ProtoPhase } from "@proto-ui/core";
import { illegalPhase } from "@proto-ui/core";

import { ModuleBase } from "@proto-ui/module-base";
import type { CapsVaultView } from "@proto-ui/module-base";
import type { PropsBaseType, PropsSpecMap } from "@proto-ui/types";

import type { PropsCaps, RawPropsSource } from "./types";
import { PropsKernel } from "./kernel/kernel";

/**
 * Props module impl: owns PropsKernel + wires RawPropsSource.
 *
 * Design:
 * - Kernel is pure + reusable.
 * - ModuleImpl handles phase guard + caps subscription + safe syncing.
 * - No auto-update / no host ops here.
 */
export class PropsModuleImpl<P extends PropsBaseType> extends ModuleBase<
  PropsCaps<P>
> {
  private readonly kernel = new PropsKernel<P>();

  private rawDirty = true; // first sync should always run (hydration)
  private subscribed = false;

  private unsubRaw: null | (() => void) = null;
  private lastSource: RawPropsSource<P> | null = null;

  // For better error context
  private readonly prototypeName: string;

  constructor(caps: CapsVaultView<PropsCaps<P>>, prototypeName: string) {
    super(caps);
    this.prototypeName = prototypeName;
  }

  // -------------------------
  // setup-only API (guarded)
  // -------------------------

  define(decl: PropsSpecMap<P>): void {
    this.guardSetupOnly("def.props.define");
    this.kernel.define(decl);
  }

  setDefaults(partialDefaults: PropsDefaults<P>): void {
    this.guardSetupOnly("def.props.setDefaults");
    this.kernel.setDefaults(partialDefaults);
  }

  watch(keys: (keyof P & string)[], cb: PropsWatchCallback<P>): void {
    this.guardSetupOnly("def.props.watch");
    this.kernel.addWatch(keys, cb);
  }

  watchAll(cb: PropsWatchCallback<P>): void {
    this.guardSetupOnly("def.props.watchAll");
    this.kernel.addWatchAll(cb);
  }

  watchRaw(
    keys: (keyof P & string)[],
    cb: RawWatchCallback<P & PropsBaseType>
  ): void {
    this.guardSetupOnly("def.props.watchRaw");
    // kernel expects string[] for raw watch; keep declared keys type here
    this.kernel.addWatchRaw(keys as any, cb as any, true);
  }

  watchRawAll(cb: RawWatchCallback<P & PropsBaseType>): void {
    this.guardSetupOnly("def.props.watchRawAll");
    this.kernel.addWatchRawAll(cb as any, true);
  }

  // -------------------------
  // runtime read API
  // -------------------------

  get(): PropsSnapshot<P> {
    return this.kernel.get();
  }

  getRaw(): Readonly<P & PropsBaseType> {
    return this.kernel.getRaw();
  }

  isProvided(key: keyof P): boolean {
    return this.kernel.isProvided(key);
  }

  // -------------------------
  // internal sync point
  // -------------------------

  /**
   * Pull latest raw from host and apply to kernel.
   * This is intentionally "pull" to keep module weak.
   */
  syncFromHost(run?: RunHandle<P>): void {
    // Always ensure subscription state is correct.
    // (Also handles the case where rawPropsSource identity changes.)
    this.ensureRawPropsSubscription();

    if (!this.caps.has("rawPropsSource")) return;

    // If source object changed but caps epoch didn't (rare), force dirty.
    const src = this.caps.get("rawPropsSource");
    if (this.lastSource !== src) {
      // ensureRawPropsSubscription() should have updated lastSource,
      // but keep this for extra safety in case of unusual ordering.
      this.rawDirty = true;
    }

    if (!this.rawDirty) return;

    const raw = src.get();
    this.kernel.applyRaw(raw as any, run as any);

    this.rawDirty = false;
  }

  applyRaw(nextRaw: Record<string, any>, run?: RunHandle<P>): void {
    // push 路径：认为这是“最新 raw”，所以直接清 dirty
    this.kernel.applyRaw({ ...(nextRaw ?? {}) } as any, run as any);
    this.rawDirty = false;
  }

  getDiagnostics() {
    return this.kernel.getDiagnostics?.() ?? [];
  }

  // -------------------------
  // caps + lifecycle wiring
  // -------------------------

  override onProtoPhase(phase: ProtoPhase): void {
    super.onProtoPhase(phase);

    if (phase === "unmounted") {
      // Ensure we always tear down subscriptions even if runtime doesn't call an explicit dispose hook.
      this.dispose();
    }
  }

  protected override onCapsEpoch(_epoch: number): void {
    // caps changed => we might need to (re)subscribe
    this.ensureRawPropsSubscription();
    // changing caps is also a reason to consider raw dirty
    this.rawDirty = true;
  }

  dispose(): void {
    this.unsubRaw?.();
    this.unsubRaw = null;
    this.subscribed = false;
    this.lastSource = null;

    this.rawDirty = true;

    // kernel lifecycle reset (optional)
    this.kernel.dispose?.();
  }

  // -------------------------
  // internal helpers
  // -------------------------

  private guardSetupOnly(op: string) {
    if (this.protoPhase !== "setup") {
      throw illegalPhase(op, this.protoPhase, {
        prototypeName: this.prototypeName,
        hint: `Use 'run' callbacks (created/mounted/updated) for runtime behavior; do not call def.* after setup.`,
      });
    }
  }

  private ensureRawPropsSubscription(): void {
    const has = this.caps.has("rawPropsSource");

    // lost capability => unsubscribe
    if (!has) {
      if (this.unsubRaw) {
        this.unsubRaw();
        this.unsubRaw = null;
      }
      this.subscribed = false;
      this.lastSource = null;
      return;
    }

    const src = this.caps.get("rawPropsSource");

    // same source and already subscribed
    if (this.subscribed && this.lastSource === src) return;

    // source replaced => resub
    if (this.unsubRaw) {
      this.unsubRaw();
      this.unsubRaw = null;
    }

    this.lastSource = src;
    this.subscribed = true;

    this.unsubRaw = src.subscribe(() => {
      // NOTE: we do NOT call syncFromHost() here because we don't have `run`.
      // Runtime should call syncFromHost(run) at safe points.
      this.rawDirty = true;
    });
  }
}
