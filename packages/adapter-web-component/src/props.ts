// packages/adapter-web-component/src/props.ts

import type { RuntimeController } from "@proto-ui/runtime";

const rawMap = new WeakMap<HTMLElement, Record<string, any>>();
const ctrlMap = new WeakMap<HTMLElement, RuntimeController>();

export function setElementProps(el: HTMLElement, nextRaw: Record<string, any>) {
  rawMap.set(el, nextRaw ?? {});
  const ctrl = ctrlMap.get(el);
  if (ctrl) ctrl.applyProps(nextRaw ?? {});
}

export function getElementProps(el: HTMLElement) {
  return rawMap.get(el);
}

export function bindController(el: HTMLElement, ctrl: RuntimeController) {
  ctrlMap.set(el, ctrl);
  // if props already set before connected, apply once now (hydration would have run already in runtime,
  // but this covers the case where adapter chooses to apply again; propsMgr will handle it)
  const raw = rawMap.get(el);
  if (raw) ctrl.applyProps(raw);
}

export function unbindController(el: HTMLElement) {
  ctrlMap.delete(el);
}
