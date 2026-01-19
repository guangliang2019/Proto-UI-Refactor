# internal/contracts/state/interaction-derived.v0.md

> Status: Draft – implementation-ready (contract-first)
> This contract specifies **derived interaction states**: readonly state-shaped values driven by adapter/event streams (e.g. `pressed`, `focused`).
> They are designed to be consumed by `rule` and by component runtime logic without imperative “sticky” style hacks.

---

## 0. Scope & Non-goals

### 0.1 Scope

This contract defines:

- the existence of a small set of **interaction-derived states** in v0
- their readonly handle capabilities (`get` + `watch`, no `set`)
- their update/reset semantics (event-driven + lifecycle reset)
- their visibility rules (prototype-side protected readonly; app-side via expose is public readonly)
- error model

### 0.2 Non-goals (v0)

- user-defined “custom derived” interaction states (author can build via watch + own state)
- exposing adapter-specific event targets through the state API
- gesture-level abstractions (drag/pinch) as first-class states

---

## 1. Definitions

### 1.1 Interaction-derived state

An interaction-derived state is:

- a **state-shaped** observable value
- updated by the runtime/adapter based on host interaction events
- readonly to prototypes (cannot be set directly)

### 1.2 Readonly state handle

Readonly handle capabilities:

- MUST provide: `get()`
- MUST provide: `watch(cb)`
- MUST NOT provide: `set(...)`, `setDefault(...)`, `subscribe(...)` (app-side subscribe is exposed only via `public` handle from expose channel, not via this handle)

> Note: For prototype-side consumption, `watch` is the lifecycle-managed callback form (auto cleanup on unmount).

---

## 2. Visibility and access

### 2.1 Prototype-side visibility

Interaction-derived states MUST be available to prototypes as **protected readonly** handles.

- They are treated like “injected states” in terms of watchability:

  - `watch` is allowed (prototype can react)
  - `set` is not allowed (readonly)

### 2.2 App-side visibility

App makers MUST NOT obtain these handles unless explicitly exposed via the expose channel.

If exposed:

- the resulting public state handle remains readonly (watch/subscribe only, no set), consistent with v0 state visibility rules.

---

## 3. v0 interaction-derived state set

v0 MUST provide (at minimum):

### 3.1 `focused: boolean`

- Meaning: whether the component root is currently focused (or focus-within, depending on adapter policy; see 3.1.4)
- Default: `false`

#### 3.1.1 Enter/Exit semantics

- Enter: on host “focus gained”
- Exit: on host “focus lost” (blur)

#### 3.1.2 Unmount reset

- On unmount, MUST reset to default (`false`).

#### 3.1.3 Consistency rule

- The runtime MUST guarantee that `focused` does not remain `true` after unmount.

#### 3.1.4 Adapter policy note (non-normative)

- Adapters may choose “root focus” or “focus-within” semantics.
- v0 contract only requires internal consistency and a stable observable boolean.

---

### 3.2 `pressed: boolean`

- Meaning: whether the component root is in an active press interaction
- Default: `false`

#### 3.2.1 Enter/Exit semantics

- Enter: on host “pointer down” on the root target
- Exit: on host “pointer up” OR “pointer cancel” (or equivalent cancellation events)

#### 3.2.2 Cancellation completeness

Runtime/adapters MUST account for cancellation conditions that may prevent a clean “up” event, such as:

- pointer cancellation
- pointer capture loss
- node removal/unmount

Exact host events vary by platform; adapters MUST ensure the observable boolean returns to `false` reliably.

#### 3.2.3 Unmount reset

- On unmount, MUST reset to default (`false`).

#### 3.2.4 Consistency rule

- The runtime MUST guarantee that `pressed` does not remain `true` after unmount.

---

## 4. Watch semantics

### 4.1 Trigger conditions

- `watch` MUST only fire when the value actually changes.
- `watch` MUST provide access to previous and next values via the state watch event model (as defined by `state-v0.md`).

### 4.2 Cleanup

- Prototype-side `watch` callbacks MUST be automatically cleaned up on unmount.

### 4.3 Re-entrancy

- Re-entrancy follows the general state rules (simple protection allowed; cb may trigger additional updates).

---

## 5. Phase rules

- Accessing `get()` is allowed in runtime phases where state reads are allowed by `state-v0.md`.
- Registering `watch(...)` follows the phase rules of protected watch in `state-v0.md` (typically setup-only registration, runtime invocation).

(Do not invent a new phase model here; interaction-derived states obey the same handle rules as other states.)

---

## 6. Error model

Implementations MUST throw for:

- phase violations (misuse of setup-only APIs)
- attempts to mutate readonly interaction-derived states

### 6.1 Error typing (minimum)

Errors MUST be distinguishable by type or code (e.g. `error.code`).

Recommended codes (v0):

- `STATE_PHASE_VIOLATION`
- `STATE_READONLY_MUTATION`
