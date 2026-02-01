// packages/module-base/src/caps-vault/types.ts
import type { CapEntries } from "@proto-ui/core";

export type Unsubscribe = () => void;

export interface CapsController {
  attach(entries: CapEntries): void;
  reset(): void;
}
