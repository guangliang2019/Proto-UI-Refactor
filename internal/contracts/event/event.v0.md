# internal/contracts/event/event.v0.md

> Status: Draft – implementation-ready (contract-first)
> This contract specifies Proto UI **event**: setup-only registration, runtime callback signature, default binding target, global events, auto cleanup, listener tokens, and error model.

---

## 0. Scope & Non-goals

### 0.1 Scope

Event provides:

- setup-only APIs to register/unregister event listeners
- setup-only **listener tokens** to precisely identify each registration
- runtime-only callback invocation with stable signature
- default binding to component root (interaction subject)
- optional global event bindings
- automatic cleanup on unmount
- optional dev-only diagnostics labeling

### 0.2 Non-goals (v0)

- gesture abstraction (drag/pinch/etc.) as first-class APIs
- event-to-rule automatic compilation (may be added later)
- event deduplication or listener coalescing (explicit is preferred)
- exposing adapter-specific global targets (e.g. `window` vs `document`) in the event facade
- runtime-time dynamic subscription management (e.g. `run.event.*`) — setup-only only in v0

---

## 1. Terminology

- **Root target**: the component instance’s root host node (default event binding target).
- **Global target**: an adapter-defined host-global event target (not exposed by the facade).
- **Native event**: platform event object (Web: `Event` / `PointerEvent` / etc.).
- **ProtoEvent**: a portable semantic event name + minimum guarantees defined by Proto UI (this contract).

---

## 2. API surface and phases

### 2.1 Setup-only registration

Event registration MUST be setup-only:

- `def.event.on(type, cb, options?) => EventListenerToken`
- `def.event.off(type, cb, options?)`
- `def.event.onGlobal(type, cb, options?) => EventListenerToken`
- `def.event.offGlobal(type, cb, options?)`
- `def.event.offToken(token)`

Any attempt to call these APIs after setup MUST throw (phase violation).

> Notes (normative):
>
> - `on` / `onGlobal` MUST create a new registration entry each time they are called.
> - Tokens identify one exact registration entry (§4.4).

### 2.2 Runtime-only callbacks

Registered callbacks are invoked only during runtime callback phase.

Callback signature MUST be:

- `cb(run, ev) => void`

Where:

- `run` is the runtime handle (always the first parameter)
- `ev` is an event object (either `NativeEvent` or a host-defined semantic event object)
  depending on adapter policy

---

## 3. Binding targets

### 3.1 Root target (default)

- `def.event.on(...)` MUST bind the listener to the component instance’s **root target** by default.
- The root target is the component’s interaction subject.

### 3.2 Global target (adapter-defined)

- `def.event.onGlobal(...)` MUST bind the listener to an adapter-defined **global target**.
- The event facade MUST NOT expose or allow selecting the concrete global target (adapter detail).

Implementation note (non-normative):

- Web adapters typically choose `window` as the global target default.

### 3.3 No-registrations binding rule (Normative)

If there are **no registered listeners** (neither root nor global):

- calling the runtime port `bind(run)` MUST be a **no-op**
- `bind(run)` MUST NOT require any binding targets to exist
- `bind(run)` MUST NOT read adapter/host targets in a way that can throw
  (e.g. it MUST NOT fail due to missing capabilities)

If there are registered listeners:

- root target MUST be required **only if** there exists at least one root registration
- global target MUST be required **only if** there exists at least one global registration

> Rationale (informative):
> The runtime may call `bind(run)` at CP4 (instance:reachable) unconditionally.
> Prototypes that register no events must not be forced to provide event-related caps.

---

## 4. Listener registration model

### 4.1 Options compatibility

`options` MUST align with the host platform’s listener options shape when applicable (Web: `capture`, `passive`, `once`).

### 4.2 Off matching rule

- `off` / `offGlobal` MUST remove listeners by exact matching of:

  - `type`
  - `cb` reference
  - `options` (host-equivalent matching)

- `off` / `offGlobal` MUST remove **exactly one** matching registration entry per call.
  Latest-first removal is RECOMMENDED.

### 4.3 No deduplication

- Event registration MUST NOT deduplicate.
- Multiple identical registrations MUST result in multiple listener entries (host behavior permitting).

### 4.4 Listener tokens (normative)

Each call to `on` / `onGlobal` MUST return an `EventListenerToken` that identifies
the exact registration entry created by that call.

#### 4.4.1 Token shape (minimum)

An `EventListenerToken` MUST include:

- a stable opaque `id: string`

The token MAY include additional methods/fields as long as they do not affect runtime semantics.

#### 4.4.2 Precise removal via token

- `def.event.offToken(token)` MUST remove exactly the registration entry identified by the token (if present).
- If the registration entry is currently bound, it MUST be detached immediately as part of `offToken`.
- Calling `offToken` with an unknown / already-removed token MUST be a no-op (no throw),
  except for invalid argument shape (§7).

> Rationale (informative):
> Tokens allow `asHook` to expose its internal registrations as an index, enabling the caller
> to selectively revoke or replace specific registrations during setup without treating hooks as black boxes.

### 4.5 Token description / diagnostics labeling (dev-only)

`EventListenerToken` MAY provide a fluent diagnostic labeling method:

- `token.desc(text) => EventListenerToken`

Rules:

- `token.desc(text)` MUST be setup-only. Any call after setup MUST throw (phase violation).
- In development builds, implementations MAY attach `text` as a diagnostic label
  associated with the token’s registration entry.
- In production builds, implementations MAY treat `desc()` as a no-op, but it MUST:
  - remain callable
  - return the same token instance (or an equivalent token with the same `id`)

> Non-normative:
> This is intended for debugging and tooling. It must not be relied on for behavioral logic.

---

## 5. Automatic cleanup

- All listeners registered via `def.event.on` and `def.event.onGlobal` MUST be automatically removed when the component instance unmounts.
- `off` / `offGlobal` / `offToken` are allowed to remove listeners earlier, but are not required for correctness.

---

## 6. Event Types (ProtoEvent Union, v0)

... (unchanged) ...

---

## 7. Error model

Implementations MUST throw for:

- phase violations (setup-only misuse)
- binding failures (root/global target unavailable **when required**)
- invalid arguments (e.g. empty event type, non-function callback, invalid token)

### 7.1 Error typing (minimum)

Errors MUST be distinguishable by type or code (e.g. `error.code`).

Recommended codes (v0):

- `EVENT_PHASE_VIOLATION`
- `EVENT_TARGET_UNAVAILABLE`
- `EVENT_INVALID_ARGUMENT`
