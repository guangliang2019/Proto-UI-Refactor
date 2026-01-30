// packages/core/src/prototype.ts
import type { PropsBaseType } from "@proto-ui/types";
import type { DefHandle, RendererHandle } from "./handles";
import type { TemplateChildren } from "./spec";

export interface Prototype<Props extends PropsBaseType = PropsBaseType> {
  name: string;
  setup: (def: DefHandle<Props>) => RenderFn | void;
}

export type RenderFn = <Props extends PropsBaseType>(
  renderer: RendererHandle<Props>
) => TemplateChildren;

/** Thin wrapper: stabilize author-facing entry & improve inference */
export function definePrototype<P extends PropsBaseType>(
  proto: Prototype<P>
): Prototype<P> {
  if (!proto || typeof proto !== "object") {
    throw new Error(`[Prototype] definePrototype() expects an object.`);
  }
  if (!proto.name || typeof proto.name !== "string") {
    throw new Error(`[Prototype] illegal name.`);
  }
  if (typeof proto.setup !== "function") {
    throw new Error(`[Prototype] setup must be a function.`);
  }
  return proto;
}

/**
 * AsHook is still "a prototype authored by Component Author",
 * but its *import result* will be treated as borrowed in the future.
 */
export interface AsHook<Props extends PropsBaseType = PropsBaseType>
  extends Prototype<Props> {
  kind: "asHook";
}

export function defineAsHook<P extends PropsBaseType>(
  proto: Prototype<P>
): AsHook<P> {
  const p = definePrototype(proto) as AsHook<P>;
  p.kind = "asHook";

  // Optional but useful: enforce naming convention early
  if (!/^as[A-Z]/.test(p.name)) {
    // 这里你自己决定是 throw 还是 warn；契约若要强制，就 throw
    throw new Error(
      `[AsHook] name must start with "as" followed by Capital letter, got: ${p.name}`
    );
  }
  return p;
}
