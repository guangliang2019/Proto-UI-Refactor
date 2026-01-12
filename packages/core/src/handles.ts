// packages/core/src/handles.ts
import { UnUse } from "./feedback";
import { StyleHandle } from "./style";
import type {
  TemplateType,
  TemplateProps,
  TemplateChildren,
  TemplateNode,
} from "./template";

// 统一错误上下文，方便在 runtime 做 phase guard 时给出可诊断信息

export interface GuardInfo {
  prototypeName: string;
  phase: Phase;
}

/**
 * Handles are how we strictly separate phases:
 * - def: setup-only (declare intent, register callbacks). After setup, any def usage must throw.
 * - renderer: render-time (build template). It provides el/r + a readonly view `read`.
 * - run: callback-time (runtime callbacks, lifecycle/effects/handlers).
 *
 * core only defines types; runtime enforces phase rules via guards.
 */

export type Phase = "setup" | "render" | "callback" | "unknown";

export interface RunHandle {
  update(): void;

  props: {
    get(): Readonly<Record<string, any>>;
    getRaw(): Readonly<Record<string, any>>;
    isProvided(key: string): boolean;
  };
  context: {
    read(key: any): any;
    tryRead(key: any): any;
  };
  state: {
    read(id: any): any;
    set?(id: any, value: any): void;
  };
}

export interface DefHandle {
  lifecycle: {
    onCreated(cb: (run: RunHandle) => void): void;
    onMounted(cb: (run: RunHandle) => void): void;
    onUpdated(cb: (run: RunHandle) => void): void;
    onUnmounted(cb: (run: RunHandle) => void): void;
  };

  props: {
    define(decl: Record<string, any>): void;
    setDefaults(partialDefaults: Record<string, any>): void;
    watch(keys: string[], cb: (next: any, prev: any, info: any) => void): void;
    watchAll(cb: (next: any, prev: any, info: any) => void): void;

    watchRaw(
      keys: string[],
      cb: (nextRaw: any, prevRaw: any, info: any) => void
    ): void;
    watchRawAll(cb: (nextRaw: any, prevRaw: any, info: any) => void): void;
  };

  context: {
    subscribe(key: any): void;
    trySubscribe(key: any): void;
  };

  state: {
    define(id: any, options?: any): void;
  };

  feedback: {
    style: {
      use: (...handles: StyleHandle[]) => UnUse;
    };
  };

  rule: (spec: any) => void;
}

// render-time 句柄：构造模板 + 只读读取视图（read）
// 注意：这里不叫 run，避免和 callback-time 的 run 混淆
export interface RenderReadHandle {
  props: RunHandle["props"];
  context: RunHandle["context"];
  state: RunHandle["state"];
}

export interface ReservedFactories {
  slot(): TemplateNode;
}

export interface ElementFactory {
  (type: TemplateType): TemplateNode;
  (type: TemplateType, children: TemplateChildren): TemplateNode;
  (
    type: TemplateType,
    props: TemplateProps,
    children?: TemplateChildren
  ): TemplateNode;
}

export interface RendererHandle {
  el: ElementFactory;
  r: ReservedFactories;
  read: RenderReadHandle; // render 阶段可用的 readonly 快照视图
}
