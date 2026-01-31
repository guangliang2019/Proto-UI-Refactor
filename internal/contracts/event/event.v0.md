# internal/contracts/event/event.v0.md

> **Status**: Draft – implementation-ready (contract-first)
> **Version**: v0
>
> This document specifies the **Proto UI Event information flow**:
> setup-time registration semantics, runtime callback guarantees, binding rules,
> lifecycle cleanup, and the observable behavior exposed via `def.event`.

---

## Layering Note (Normative)

This contract specifies the **event information flow as observed by prototype authors**
via `def.event`.

It does **not** prescribe the internal structure, storage model, or port signatures
of any specific event module implementation.

In particular:

- This contract defines _what_ must happen (observable behavior and guarantees),
  not _how_ event dispatch is internally implemented.
- Module-level APIs (e.g. binding ports, dispatch indirection, target resolution)
  are considered implementation details unless explicitly stated otherwise.

---

## 0. Scope & Non-goals

### 0.1 Scope

Event provides:

- setup-only APIs to register and unregister event listeners
- setup-only **listener tokens** to precisely identify individual registrations
- runtime-only callback invocation with a stable signature
- default binding to the component instance’s root interaction target
- optional adapter-defined global event bindings
- automatic cleanup on unmount
- optional dev-only diagnostics labeling

### 0.2 Non-goals (v0)

The following are explicitly out of scope for v0:

- gesture abstractions (drag / pinch / etc.) as first-class APIs
- automatic event-to-rule compilation
- event deduplication or listener coalescing
- exposing concrete adapter targets (e.g. `window`, `document`) in the facade
- runtime-time dynamic subscription management (`run.event.*`)
- prescribing a specific internal event module architecture

---

## 1. Terminology

- **Root target**
  The component instance’s primary interaction subject, as defined by the adapter.

- **Global target**
  An adapter-defined host-global event target.

- **Native event**
  A platform event object (Web: `Event`, `PointerEvent`, etc.).

- **ProtoEvent**
  A portable semantic event name with minimum guarantees defined by Proto UI.

---

## 2. API Surface and Phases

### 2.1 Setup-only registration

Event registration APIs are **setup-only**:

- `def.event.on(type, cb, options?) => EventListenerToken`
- `def.event.off(type, cb, options?)`
- `def.event.onGlobal(type, cb, options?) => EventListenerToken`
- `def.event.offGlobal(type, cb, options?)`
- `def.event.offToken(token)`

Rules (normative):

- Any attempt to call these APIs after setup **MUST throw** a phase-violation error.
- Each call to `on` / `onGlobal` **MUST create a new registration entry**.
- Registrations **MUST NOT be deduplicated**.

### 2.2 Runtime-only callbacks

Registered callbacks are invoked **only during the runtime callback phase**.

Callback signature MUST be:

```
cb(run, ev) => void
```

Where:

- `run` is the runtime handle (always the first parameter)
- `ev` is a native or host-defined event object

#### Layering constraint (Normative)

- The presence of `run` in the callback signature is a requirement of the
  **event information flow**, not of any specific event module.
- Event modules **MUST NOT** be required to store, construct, or reason about
  runtime handles.
- The mechanism by which `run` is associated with a callback invocation
  (e.g. dispatch indirection, identifier lookup) is a responsibility of the runtime.

---

## 3. Binding Targets and Timing

### 3.1 Root target (default)

- `def.event.on(...)` registrations bind to the component instance’s **root target**
  by default.
- The root target represents the instance’s primary interaction subject.

### 3.2 Global target (adapter-defined)

- `def.event.onGlobal(...)` registrations bind to an adapter-defined **global target**.
- The event facade **MUST NOT** expose or allow selection of the concrete global target.

> _Non-normative note:_
> Web adapters commonly choose `window` as the global target.

### 3.3 Binding time and no-registrations rule (Normative)

Event listeners are bound by the runtime at a well-defined safe point
after the component instance becomes reachable.

If there are **no registered listeners** (neither root nor global):

- The binding step **MUST be a no-op**.
- The binding step **MUST NOT** require any event targets to exist.
- The binding step **MUST NOT** read adapter or host targets in a way that can throw.

If there are registered listeners:

- A root target **MUST be required only if** at least one root registration exists.
- A global target **MUST be required only if** at least one global registration exists.

> _Informative:_
> Runtimes MAY perform the binding step unconditionally; prototypes with no
> registrations must not be penalized.

---

### 3.4 Root target redirection (v0)

Event systems MUST support redirecting the **root binding target** during setup.

Rules (normative):

- Root target redirection **MUST be setup-only**.
- The redirected target **MUST** be used for all root-scoped registrations.
- Global registrations **MUST NOT** be affected.
- Any attempt to redirect the root target after setup **MUST throw**
  a phase-violation error.
- Once setup completes, the resolved root target **MUST remain stable**
  for the lifetime of the component instance.

> _Rationale (informative):_
> This enables composition patterns where interaction responsibility is delegated
> to a specific sub-host without exposing adapter-specific details.

---

## 4. Listener Registration Model

### 4.1 Options compatibility

Listener `options` MUST align with the host platform’s listener options shape
when applicable (Web: `capture`, `passive`, `once`).

### 4.2 Off matching rule

- `off` / `offGlobal` MUST remove listeners by exact matching of:

  - event `type`
  - callback reference `cb`
  - listener `options` (host-equivalent matching)

- Each call MUST remove **exactly one** matching registration entry.
- Latest-first removal is RECOMMENDED.

#### Layering constraint (Normative)

- Matching semantics involving callback identity and option equivalence
  are defined at the `def.event` level.
- Event modules MAY operate on opaque registration identifiers and are not
  required to store or compare callback references.

### 4.3 No deduplication

- Event registration MUST NOT deduplicate.
- Multiple identical registrations MUST result in multiple listener entries
  (host behavior permitting).

### 4.4 Listener tokens

Each call to `on` / `onGlobal` MUST return an `EventListenerToken`
identifying the exact registration entry created by that call.

#### 4.4.1 Token shape (minimum)

An `EventListenerToken` MUST include:

- a stable opaque `id: string`

Additional fields or methods MAY exist as long as they do not affect runtime behavior.

#### 4.4.2 Precise removal via token

- `def.event.offToken(token)` MUST remove exactly the identified registration entry.
- If the entry is currently bound, it **MUST be detached immediately**.
- Passing an unknown or already-removed token **MUST be a no-op**
  (except for invalid argument shape).

### 4.5 Token description / diagnostics labeling (dev-only)

Tokens MAY provide a fluent diagnostic labeling API:

```
token.desc(text) => EventListenerToken
```

Rules:

- `desc()` MUST be setup-only.
- Calls after setup MUST throw a phase-violation error.
- In production builds, `desc()` MAY be a no-op but MUST remain callable
  and return the same token instance.

---

## 5. Automatic Cleanup

- All listeners registered via `def.event.on` and `def.event.onGlobal`
  MUST be automatically removed when the component instance unmounts.
- Manual removal APIs MAY remove listeners earlier but are not required
  for correctness.

---

## 6. Event Types (ProtoEvent Union, v0)

_(unchanged)_

---

## 7. Error Model

Implementations MUST throw for:

- phase violations (setup-only or runtime-only misuse)
- binding failures (required targets unavailable)
- invalid arguments (empty type, non-function callback, invalid token)

### 7.1 Error typing (minimum)

Errors MUST be distinguishable by type or code.

Recommended codes (v0):

- `EVENT_PHASE_VIOLATION`
- `EVENT_TARGET_UNAVAILABLE`
- `EVENT_INVALID_ARGUMENT`

---

## Appendix A: Contract Coverage (Informative)

This contract is enforced by executable contract tests covering:

- no-registrations binding behavior
- target availability requirements
- immediate detachment on `offToken`
- automatic cleanup on unmount
- setup-only and runtime-only phase enforcement
- root target redirection semantics

See `packages/module-event/test/contract/` for executable specifications.
