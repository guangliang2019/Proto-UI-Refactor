// packages/adapter-web-component/src/events.ts
type Unsub = () => void;

export function createWebProtoEventRouter(opt: {
  rootEl: HTMLElement;
  globalEl?: EventTarget; // window by default
  isEnabled: () => boolean; // bridge to eventGate
}) {
  const bus = new EventTarget();
  const globalBus = new EventTarget();

  const rootEl = opt.rootEl;
  const globalEl = opt.globalEl ?? window;

  // ---- helpers: dispatch proto event ----
  function emit(target: EventTarget, type: string, native: any) {
    // Use CustomEvent so we can carry payload in detail.
    // event module doesn't enforce shape; adapter decides.
    const ev = new CustomEvent(type, { detail: native });
    target.dispatchEvent(ev);
  }

  // ---- wiring native -> proto ----
  // Note: you can choose capture/passive policies later; v0 keep minimal.
  const unsubs: Unsub[] = [];

  // pointer -> pointer.*
  unsubs.push(
    listen(rootEl, "pointerdown", (e) => {
      if (!opt.isEnabled()) return;
      emit(bus, "pointer.down", e);
    })
  );
  unsubs.push(
    listen(rootEl, "pointermove", (e) => {
      if (!opt.isEnabled()) return;
      emit(bus, "pointer.move", e);
    })
  );
  unsubs.push(
    listen(rootEl, "pointerup", (e) => {
      if (!opt.isEnabled()) return;
      emit(bus, "pointer.up", e);
    })
  );
  unsubs.push(
    listen(rootEl, "pointercancel", (e) => {
      if (!opt.isEnabled()) return;
      emit(bus, "pointer.cancel", e);
    })
  );
  unsubs.push(
    listen(rootEl, "pointerenter", (e) => {
      if (!opt.isEnabled()) return;
      emit(bus, "pointer.enter", e);
    })
  );
  unsubs.push(
    listen(rootEl, "pointerleave", (e) => {
      if (!opt.isEnabled()) return;
      emit(bus, "pointer.leave", e);
    })
  );

  // key -> key.* (global is more reasonable for keyboard)
  unsubs.push(
    listen(globalEl, "keydown", (e: KeyboardEvent) => {
      if (!opt.isEnabled()) return;
      emit(globalBus, "key.down", e);

      // minimal v0 mapping: activate keys => press.commit
      // This is adapter-defined policy. You can move to a stricter press state machine later.
      if (e.key === "Enter" || e.key === " ") {
        emit(bus, "press.commit", e);
      }
    })
  );

  unsubs.push(
    listen(globalEl, "keyup", (e: KeyboardEvent) => {
      if (!opt.isEnabled()) return;
      emit(globalBus, "key.up", e);
    })
  );

  // click -> press.commit (root)
  unsubs.push(
    listen(rootEl, "click", (e) => {
      if (!opt.isEnabled()) return;
      emit(bus, "press.commit", e);
    })
  );

  // Optional: contextmenu
  unsubs.push(
    listen(rootEl, "contextmenu", (e) => {
      if (!opt.isEnabled()) return;
      emit(bus, "context.menu", e);
    })
  );

  return {
    /** These are the targets you inject into event module caps */
    rootTarget: bus as EventTarget,
    globalTarget: globalBus as EventTarget,

    dispose() {
      for (const u of unsubs.splice(0)) u();
    },
  };
}

function listen(t: any, type: string, cb: (ev: any) => void): Unsub {
  t.addEventListener(type, cb as any);
  return () => t.removeEventListener(type, cb as any);
}
