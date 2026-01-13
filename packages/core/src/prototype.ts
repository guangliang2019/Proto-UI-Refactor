// packages/core/src/prototype.ts
import type { PropsBaseType } from "@proto-ui/types";
import {
  DEFAULT_NORMALIZE,
  normalizeChildren,
  TemplateProps,
  type NormalizeOptions,
  type TemplateChildren,
} from "./template";

import type {
  DefHandle,
  ElementFactory,
  RendererHandle,
  ReservedFactories,
} from "./handles";
import { isTemplateStyleHandle } from "./style";

export interface PrototypeRef {
  kind: "prototype";
  name: string;
  ref?: unknown;
}

function isTemplateProps(v: any): v is TemplateProps {
  if (!v || typeof v !== "object") return false;
  // Only allowed key is "style"
  const keys = Object.keys(v);
  if (keys.length === 0) return true;
  if (keys.length === 1 && keys[0] === "style") return true;
  return false;
}

function assertTemplateProps(v: any) {
  if (!isTemplateProps(v)) {
    throw new Error(
      `[Template] illegal template-props: only { style?: TemplateStyleHandle } is allowed.\n illegal template-props value: ${JSON.stringify(
        v
      )}`
    );
  }
  if (v?.style && !isTemplateStyleHandle(v.style)) {
    throw new Error(`[Template] style must be a TemplateStyleHandle.`);
  }
}

/**
 * Proto UI has an invisible, mandatory HostRoot per instance.
 * RenderFn describes ONLY HostRoot's children.
 */
export interface Prototype<Props extends PropsBaseType = PropsBaseType> {
  name: string;
  setup: (def: DefHandle<Props>) => RenderFn | void;
}

export type RenderFn = <Props extends PropsBaseType>(
  renderer: RendererHandle<Props>
) => TemplateChildren;

export interface RendererPrimitivesOptions {
  normalize?: NormalizeOptions;
}

/**
 * Create platform-agnostic renderer primitives used by runtime/adapters.
 * - `el` builds TemplateNode
 * - `r` builds reserved nodes (fragment/slot)
 * - children are normalized (boolean/undefined illegal, null treated as empty)
 */
export function createRendererPrimitives(opt: RendererPrimitivesOptions = {}) {
  const normOpt = opt.normalize ?? DEFAULT_NORMALIZE;

  const el: ElementFactory = function (type: any, a?: any, b?: any) {
    let props: TemplateProps | undefined;
    let childrenInput: any = null;

    if (arguments.length === 1) {
      childrenInput = null;
    } else if (arguments.length === 2) {
      if (isTemplateProps(a)) {
        assertTemplateProps(a);
        props = a;
        childrenInput = null;
      } else {
        childrenInput = a;
      }
    } else {
      assertTemplateProps(a);
      props = a;
      childrenInput = b;
    }

    return {
      type,
      style: props?.style,
      children: normalizeChildren(childrenInput, normOpt),
    };
  };

  const r: ReservedFactories = {
    slot() {
      if (arguments.length > 0) {
        const args = Array.from(arguments);
        throw new Error(
          `[Template] slot() takes no arguments.\n illegal slot arguments: ${JSON.stringify(
            args
          )}`
        );
      }
      return el({ kind: "slot" });
    },
  };

  return { el, r };
}

/**
 * Represent a Prototype as a TemplateType safely (debuggable/serializable).
 */
export function asPrototypeRef(proto: Prototype): PrototypeRef {
  return { kind: "prototype", name: proto.name, ref: proto };
}
