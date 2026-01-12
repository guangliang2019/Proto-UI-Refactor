// packages/adapter-web-component/src/props.ts
import type { RuntimeController } from "@proto-ui/runtime";
import { applyStyleTokensToHost } from "./feedback-style";

const rawMap = new WeakMap<HTMLElement, Record<string, any>>();
const ctrlMap = new WeakMap<HTMLElement, RuntimeController>();

function applyStyleFromController(el: HTMLElement, ctrl: RuntimeController) {
  // v0: base feedback snapshot + dynamic rule tokens
  const base = ctrl.getFeedbackStyleTokens?.() ?? [];
  const dyn = ctrl.getRuleStyleTokens?.() ?? [];
  applyStyleTokensToHost(el, [...base, ...dyn]);
}

export function setElementProps(el: HTMLElement, nextRaw: Record<string, any>) {
  rawMap.set(el, nextRaw ?? {});
  const ctrl = ctrlMap.get(el);
  if (ctrl) {
    ctrl.applyProps(nextRaw ?? {});
    applyStyleFromController(el, ctrl);
  }
}

export function getElementProps(el: HTMLElement) {
  return rawMap.get(el);
}

export function bindController(el: HTMLElement, ctrl: RuntimeController) {
  ctrlMap.set(el, ctrl);

  // if props already set before connected, apply once now
  const raw = rawMap.get(el);
  if (raw) ctrl.applyProps(raw);

  // always apply style once on bind (covers: no-props case + hydration case)
  applyStyleFromController(el, ctrl);
}

export function unbindController(el: HTMLElement) {
  ctrlMap.delete(el);
}
