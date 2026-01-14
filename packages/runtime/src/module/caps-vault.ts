import type { CapsVaultView, Unsubscribe } from "@proto-ui/core";
import { capUnavailable } from "@proto-ui/core";

/**
 * Runtime-side mutable vault.
 * - Modules only get CapsVaultView<C>
 * - Runtime/adapter can attach/reset capabilities
 */
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

  /** runtime-only */
  attach(partial: Partial<Caps>): void {
    Object.assign(this.caps, partial);
    this.bump();
  }

  /** runtime-only */
  reset(): void {
    this.caps = {};
    this.bump();
  }

  private bump(): void {
    this.epoch++;
    for (const cb of this.listeners) cb(this.epoch);
  }
}
