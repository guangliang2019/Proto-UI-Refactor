// packages/module-base/src/system-caps.ts
import type { ProtoPhase } from "@proto-ui/core";

export type ExecPhase = "setup" | "render" | "callback" | "unknown";
export type GuardDomain = "setup" | "runtime";

export interface SystemCaps {
  /** exec-phase (more precise than domain) */
  execPhase(): ExecPhase;

  /** derived: setup vs runtime (kept for compatibility) */
  domain(): GuardDomain;

  /** proto lifecycle phase */
  protoPhase(): ProtoPhase;

  /** disposal state */
  isDisposed(): boolean;

  // --- guards ---
  ensureNotDisposed(op: string): void;
  ensureExecPhase(op: string, expected: ExecPhase | ExecPhase[]): void;

  /** convenience */
  ensureSetup(op: string): void;
  ensureRuntime(op: string): void;

  /**
   * callback-only: recommended for "runtime mutation" APIs (state.set etc.)
   * This prevents render-phase mutations.
   */
  ensureCallback(op: string): void;
}

export type WithSystemCaps = {
  __sys: SystemCaps;
};
