// packages/runtime/src/host.ts
import type { TemplateChildren } from "@proto-ui/core";
import type { PropsBaseType } from "@proto-ui/types";

export interface RuntimeHost<P extends PropsBaseType> {
  /** For diagnostics / errors */
  readonly prototypeName: string;

  /** Commit HostRoot children to the host platform */
  commit(children: TemplateChildren): void;

  /** Scheduling hook (for microtask/macrotask decisions, adapter controls timing) */
  schedule(task: () => void): void;

  /** host must provide raw props snapshot (may include undeclared keys) */
  getRawProps(): Readonly<P & PropsBaseType>;
}
