export type CoreEventType =
  | "press.start"
  | "press.end"
  | "press.cancel"
  | "press.commit"
  | "key.down"
  | "key.up";

export type OptionalEventType =
  | "pointer.down"
  | "pointer.move"
  | "pointer.up"
  | "pointer.cancel"
  | "pointer.enter"
  | "pointer.leave"
  | "nav.focus"
  | "nav.blur"
  | "text.focus"
  | "text.blur"
  | "input"
  | "change"
  | "context.menu";

export type ExtensionEventType = `native:${string}` | `host.${string}`;

export type EventTypeV0 =
  | CoreEventType
  | OptionalEventType
  | ExtensionEventType;

export type EventListenerOptions = any;

declare const __eventTokenBrand: unique symbol;

export type EventListenerToken = {
  readonly [__eventTokenBrand]: "EventListenerToken";
  readonly id: string;

  /**
   * Dev-only description for diagnostics.
   * In prod, this should be a no-op that returns itself.
   */
  desc(text: string): EventListenerToken;
};
