import type { ProtoPhase, CapsVaultView } from "@proto-ui/core";

export abstract class ModuleBase<Caps extends object> {
  protected protoPhase: ProtoPhase = "setup";
  protected readonly caps: CapsVaultView<Caps>;

  // simple pending queue (for “caps not ready yet” cases)
  private pending: Array<() => void> = [];

  constructor(caps: CapsVaultView<Caps>) {
    this.caps = caps;
    this.caps.onChange((epoch) => {
      this.onCapsEpoch(epoch);
      this.flushPending();
    });
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
