# internal/contracts/state/interaction-derived.v0.impl-notes.md

> Informal notes. Not normative; the contract is `interaction-derived.v0.md`.

---

## 1) Where to expose these handles

Keep access state-shaped:

- `run.state.interaction.focused`
- `run.state.interaction.pressed`

Return readonly handles that implement:

- `get()`
- `watch(cb)` (prototype-side lifecycle-managed)

Avoid adding event-flavored APIs like `run.event.isPressed()` to prevent semantic drift.

---

## 2) Driving updates (adapter responsibility)

The state module owns the shape + semantics.
Adapters/events own the inputs.

Web adapter typical mapping:

- focused:

  - root: `focus` / `blur` (consider `focusin` / `focusout` if you want focus-within)

- pressed:

  - `pointerdown` → true
  - `pointerup` / `pointercancel` → false
  - unmount → false

The adapter may also need to listen on a global target (e.g. `window`) to guarantee exit events,
but this must remain adapter-internal (not exposed in facade).

---

## 3) Reset guarantees

On unmount:

- force-set both values back to false
- do not emit extra events if already false

If you want strictness:

- optionally track “owned pointer id” for pressed to avoid multi-pointer surprises.

---

## 4) Performance

These states update frequently (pressed can change often).
Avoid deep cloning. Since values are primitives (boolean), watch dispatch is cheap.

---

## 5) Testing guidance

Even if contract tests come later, the core cases are:

- pressed toggles true/false on down/up and down/cancel
- pressed resets on unmount even if no up arrives
- focused toggles on focus/blur and resets on unmount
- watch fires only on changes
