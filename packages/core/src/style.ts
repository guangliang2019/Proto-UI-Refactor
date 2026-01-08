// packages/core/src/style.ts

export type TemplateStyleHandle =
  | { kind: "css"; cssText: string }
  | { kind: "tw"; tokens: string };

export function css(
  strings: TemplateStringsArray,
  ...expr: Array<string | number | boolean | null | undefined>
): TemplateStyleHandle;
export function css(cssText: string): TemplateStyleHandle;
export function css(
  a: TemplateStringsArray | string,
  ...expr: Array<string | number | boolean | null | undefined>
): TemplateStyleHandle {
  if (typeof a === "string") {
    return { kind: "css", cssText: normalizeCssText(a) };
  }
  // template literal
  let s = "";
  for (let i = 0; i < a.length; i++) {
    s += a[i];
    if (i < expr.length) s += String(expr[i] ?? "");
  }
  return { kind: "css", cssText: normalizeCssText(s) };
}

export function tw(tokens: string): TemplateStyleHandle {
  // Keep as IR; adapters may decide how to resolve it.
  return { kind: "tw", tokens: tokens.trim() };
}

function normalizeCssText(cssText: string) {
  // v0: shallow normalize, keep it permissive. (No validation yet.)
  return cssText.trim();
}

export function isTemplateStyleHandle(v: any): v is TemplateStyleHandle {
  return (
    v &&
    typeof v === "object" &&
    ((v.kind === "css" && typeof v.cssText === "string") ||
      (v.kind === "tw" && typeof v.tokens === "string"))
  );
}
