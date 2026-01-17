// packages/module-base/src/caps-vault.ts
import type { Unsubscribe } from "./types";
import { capUnavailable } from "@proto-ui/core";

/**
 * Mutable caps vault for runtime/host wiring.
 *
 * NOTE:
 * - module-* should depend on the *view* interface only (CapsVaultView),
 *   but in practice it's fine if they accept this class as long as they
 *   don't call attach/reset (keep it a convention).
 */
export interface CapsVaultView<Caps extends object> {
  readonly epoch: number;
  has<K extends keyof Caps>(key: K): boolean;
  get<K extends keyof Caps>(key: K): Caps[K];
  onChange(cb: (epoch: number) => void): Unsubscribe;
}

export class CapsVault<Caps extends object> implements CapsVaultView<Caps> {
  private caps: Partial<Caps> = {};
  private listeners = new Set<(epoch: number) => void>();
  epoch = 0;

  has<K extends keyof Caps>(key: K): boolean {
    return Object.prototype.hasOwnProperty.call(this.caps, key);
  }

  get<K extends keyof Caps>(key: K): Caps[K] {
    if (!this.has(key)) {
      throw capUnavailable(String(key), { epoch: this.epoch });
    }
    return (this.caps as Caps)[key];
  }

  onChange(cb: (epoch: number) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** wiring-only: host/runtime inject capabilities */
  attach(partial: Partial<Caps>): void {
    Object.assign(this.caps, partial);
    this.bump();
  }

  /** wiring-only: host/runtime invalidate all capabilities */
  reset(): void {
    this.caps = {};
    this.bump();
  }

  private bump(): void {
    this.epoch++;
    for (const cb of this.listeners) cb(this.epoch);
  }
}
