// packages/module-event/src/types.ts
import type {
  ModuleInstance,
  ProtoEventCallback,
  RunHandle,
} from "@proto-ui/core";
import type { ModulePort } from "@proto-ui/core";
import {
  EventListenerToken,
  EventTypeV0,
  PropsBaseType,
} from "@proto-ui/types";

export type EventCaps = {
  /** adapter-defined root target (interaction subject) */
  getRootTarget(): EventTarget | null;
  /** adapter-defined global target */
  getGlobalTarget(): EventTarget | null;
};

export type EventFacade<P extends PropsBaseType> = {
  // setup-only
  on(
    type: EventTypeV0,
    cb: ProtoEventCallback<P>,
    options?: EventListenerOptions
  ): EventListenerToken;

  off(
    type: EventTypeV0,
    cb: ProtoEventCallback<P>,
    options?: EventListenerOptions
  ): void;

  onGlobal(
    type: EventTypeV0,
    cb: ProtoEventCallback<P>,
    options?: EventListenerOptions
  ): EventListenerToken;

  offGlobal(
    type: EventTypeV0,
    cb: ProtoEventCallback<P>,
    options?: EventListenerOptions
  ): void;

  /** precise removal for one specific registration */
  offToken(token: EventListenerToken): void;
};

export type EventModule<P extends PropsBaseType> = ModuleInstance<
  EventFacade<P>
> & {
  name: "event";
  scope: "instance";
};

export type EventPort<P extends PropsBaseType> = ModulePort & {
  /**
   * Bind all registered listeners using current targets.
   * Runtime should call this at safe points when `run` is available.
   */
  bind(run: RunHandle<P>): void;

  /** Unbind all currently bound listeners (registrations kept) */
  unbind(): void;

  /** Optional diagnostics hook */
  getDiagnostics?(): readonly EventDiag[];
};

export type EventDiag = {
  id: string;
  kind: "root" | "global";
  type: string;
  bound: boolean;
  label?: string;
};
