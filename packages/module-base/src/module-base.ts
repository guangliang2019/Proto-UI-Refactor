import type { ProtoPhase } from "@proto-ui/core";
import type { CapsVaultView } from "./caps-vault";
import type { WithSystemCaps } from "./system-caps";

/**
 * Thin base for modules:
 * - track proto phase
 * - listen to caps changes (epoch)
 * - provide a tiny defer queue
 *
 * No render strategy, no host logic.
 */
export abstract class ModuleBase<Caps extends object> {
  protected protoPhase: ProtoPhase = "setup";
  protected readonly caps: CapsVaultView<Caps & WithSystemCaps>;

  private pending: Array<() => void> = [];

  constructor(caps: CapsVaultView<Caps & WithSystemCaps>) {
    this.caps = caps;
    this.caps.onChange((epoch) => {
      this.onCapsEpoch(epoch);
      this.flushPending();
    });
  }

  /** optional convenience getter */
  protected get sys() {
    return this.caps.get("__sys");
  }

  onProtoPhase(phase: ProtoPhase): void {
    this.protoPhase = phase;
  }

  protected onCapsEpoch(_epoch: number): void {
    // subclasses may override
  }

  protected defer(fn: () => void): void {
    this.pending.push(fn);
  }

  protected flushPending(): void {
    if (this.pending.length === 0) return;
    const tasks = this.pending;
    this.pending = [];
    for (const t of tasks) t();
  }
}
