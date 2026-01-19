# internal/contracts/event/event.v0.md

> Status: Draft – implementation-ready (contract-first)
> This contract specifies Proto UI **event**: setup-only registration, runtime callback signature, default binding target, global events, auto cleanup, and error model.

---

## 0. Scope & Non-goals

### 0.1 Scope

Event provides:

- setup-only APIs to register/unregister event listeners
- runtime-only callback invocation with stable signature
- default binding to component root (interaction subject)
- optional global event bindings
- automatic cleanup on unmount

### 0.2 Non-goals (v0)

- gesture abstraction (drag/pinch/etc.) as first-class APIs
- event-to-rule automatic compilation (may be added later)
- event deduplication or listener coalescing (explicit is preferred)
- exposing adapter-specific global targets (e.g. `window` vs `document`) in the event facade

---

## 1. Terminology

- **Root target**: the component instance’s root host node (default event binding target).
- **Global target**: an adapter-defined host-global event target (not exposed by the facade).
- **Native event**: platform event object (Web: `Event` / `PointerEvent` / etc.).
- **ProtoEvent**: a portable semantic event shape (union) defined by Proto UI.

---

## 2. API surface and phases

### 2.1 Setup-only registration

Event registration MUST be setup-only:

- `def.event.on(type, cb, options?)`
- `def.event.off(type, cb, options?)`
- `def.event.onGlobal(type, cb, options?)`
- `def.event.offGlobal(type, cb, options?)`

Any attempt to call these APIs after setup MUST throw (phase violation).

### 2.2 Runtime-only callbacks

Registered callbacks are invoked only during runtime callback phase.

Callback signature MUST be:

- `cb(run, ev) => void`

Where:

- `run` is the runtime handle (always the first parameter)
- `ev` is an event object (either `NativeEvent` or `ProtoEvent`, depending on adapter policy)

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

---

## 4. Listener options and matching

### 4.1 Options compatibility

`options` MUST align with the host platform’s listener options shape when applicable (Web: `capture`, `passive`, `once`).

### 4.2 Off matching rule

- `off` / `offGlobal` MUST remove listeners by exact matching of:

  - `type`
  - `cb` reference
  - `options` (host-equivalent matching)

### 4.3 No deduplication

- Event registration MUST NOT deduplicate.
- Multiple identical registrations MUST result in multiple listener entries (host behavior permitting).

---

## 5. Automatic cleanup

- All listeners registered via `def.event.on` and `def.event.onGlobal` MUST be automatically removed when the component instance unmounts.
- `off` / `offGlobal` are allowed to remove listeners earlier, but are not required for correctness.

---

## 6. Event types (ProtoEvent union)

Event MUST define a portable union for common UI input intents.

v0 required minimal set:

- `click`
- pointer: `pointer.down`, `pointer.move`, `pointer.up`
- key: `key.down`, `key.up`
- focus: `focus`, `blur`
- input: `input`, `change`

Notes:

- The union is for portability and cross-adapter convergence.
- Adapters MAY also pass native events directly.

---

## 7. Error model

Implementations MUST throw for:

- phase violations (setup-only misuse)
- binding failures (root/global target unavailable)
- invalid arguments (e.g. empty event type)

### 7.1 Error typing (minimum)

Errors MUST be distinguishable by type or code (e.g. `error.code`).

Recommended codes (v0):

- `EVENT_PHASE_VIOLATION`
- `EVENT_TARGET_UNAVAILABLE`
- `EVENT_INVALID_ARGUMENT`
