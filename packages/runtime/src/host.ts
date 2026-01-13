// packages/runtime/src/host.ts
import type {
  RenderReadHandle,
  RunHandle,
  TemplateChildren,
} from "@proto-ui/core";
import { PropsBaseType } from "@proto-ui/types";

export interface RuntimeHost<P extends PropsBaseType> {
  /** For diagnostics / errors */
  readonly prototypeName: string;

  /** Render-time readonly view */
  getRenderRead(): RenderReadHandle<P>;

  /** Callback-time runtime handle */
  getRunHandle(): RunHandle<P>;

  /** Commit HostRoot children to the host platform */
  commit(children: TemplateChildren): void;

  /** Scheduling hook (for microtask/macrotask decisions, adapter controls timing) */
  schedule(task: () => void): void;

  /** host must provide raw props snapshot (may include undeclared keys) */
  getRawProps(): Readonly<P & PropsBaseType>;
}
