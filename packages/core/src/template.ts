// packages/core/src/template.ts

import type { PrototypeRef } from "./prototype";
import type { TemplateStyleHandle } from "./style";

/**
 * Template is the platform-agnostic render blueprint.
 * It must be serializable/debuggable and MUST NOT carry host instance values (HTMLElement/VNode/etc).
 *
 * Canonical empty value in authoring syntax: null.
 * - boolean child: illegal
 * - undefined child: illegal (use null or omit)
 */

export type TemplateType = string | PrototypeRef | ReservedType;

export type TemplateProps = {
  style?: TemplateStyleHandle;
};

export type ReservedType = { kind: "slot" };

export interface TemplateNode {
  type: TemplateType;
  style?: TemplateStyleHandle;
  children?: TemplateChildren;
}

// NOTE: undefined is intentionally excluded to keep authoring syntax portable.
export type TemplateChild = TemplateNode | string | number | null;
export type TemplateChildren = TemplateChild | TemplateChild[] | null;

export interface NormalizeOptions {
  flatten?: "none" | "shallow" | "deep";
  /**
   * If true, keep null in output instead of filtering it out.
   * Default false: null is treated as empty and removed from template output.
   */
  keepNull?: boolean;
}

/**
 * Default normalize policy:
 * - deep flatten arrays
 * - null treated as empty and removed from output
 * - empty result becomes canonical null
 */
export const DEFAULT_NORMALIZE: Required<NormalizeOptions> = {
  flatten: "deep",
  keepNull: false,
};

export function normalizeChildren(
  input: unknown,
  opt: NormalizeOptions = DEFAULT_NORMALIZE
): TemplateChildren {
  const cfg: Required<NormalizeOptions> = { ...DEFAULT_NORMALIZE, ...opt };

  // Canonicalize "no children" to null (author-visible empty value).
  if (input === undefined) return null;

  const out: TemplateChild[] = [];

  const push = (v: unknown) => {
    if (typeof v === "boolean") {
      throw new Error(
        `[Template] boolean child is illegal. Use null for empty, or omit the child.`
      );
    }
    if (v === undefined) {
      // disallow in authoring syntax: portability
      throw new Error(
        `[Template] undefined child is illegal. Use null for empty, or omit the child.`
      );
    }
    if (v === null) {
      if (cfg.keepNull) out.push(null);
      return; // filtered by default
    }
    if (typeof v === "string" || typeof v === "number") {
      out.push(v);
      return;
    }
    // object should be a TemplateNode (we keep validation minimal here; can tighten later)
    out.push(v as TemplateChild);
  };

  const walk = (v: unknown, depth: number) => {
    if (!Array.isArray(v)) {
      push(v);
      return;
    }

    if (cfg.flatten === "none") {
      throw new Error(
        `[Template] array children is not allowed when flatten=none.`
      );
    }
    if (cfg.flatten === "shallow" && depth >= 1) {
      throw new Error(
        `[Template] nested array children is not allowed when flatten=shallow.`
      );
    }

    for (const x of v) walk(x, depth + 1);
  };

  walk(input, 0);

  if (out.length === 0) return null;
  if (out.length === 1) return out[0];
  return out;
}
