import type { CapsVault } from "./caps-vault";

export interface CapsController<Caps extends object> {
  attach(partial: Partial<Caps>): void;
  reset(): void;
}

/**
 * Narrow a vault into a controller view for adapters/hosts.
 * Prevents accidental .get/.has usage outside runtime/module.
 */
export function asCapsController<Caps extends object>(
  vault: CapsVault<Caps>
): CapsController<Caps> {
  return {
    attach: (p) => vault.attach(p),
    reset: () => vault.reset(),
  };
}
