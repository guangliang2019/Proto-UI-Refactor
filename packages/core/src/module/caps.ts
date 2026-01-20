// packages/core/src/module/caps.ts
export type Unsubscribe = () => void;

export interface CapsVaultView<Caps extends object> {
  readonly epoch: number;

  has<K extends keyof Caps>(key: K): boolean;

  /**
   * Get capability. If unavailable, should throw a stable error.
   * Modules can catch and defer by their own strategy, or use ModuleBase helpers.
   */
  get<K extends keyof Caps>(key: K): Caps[K];

  onChange(cb: (epoch: number) => void): Unsubscribe;
}
