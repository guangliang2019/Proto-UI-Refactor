# state.v0.md

> Status: Draft – implementation-aligned (v0)
> This contract specifies Proto UI **state** in v0: semantic state slots, handles, phase/dispose rules, and rendering interaction constraints.
>
> **Note (important):** v0 contract is intentionally minimal and reflects the current implementation.
> Features like visibility profiles, `watch/subscribe`, semantic collision, and spec validation are **NOT part of v0** and are tracked in the Roadmap section.

---

## 0. Scope & Non-goals

### 0.1 Scope (v0)

State provides:

- Setup-time creation of semantic state slots via `def.state.*`.
- Handle-based operations:
  - `get()`
  - `setDefault(v)`
  - `set(v, reason?)`
- Strict phase enforcement for setup vs runtime operations.
- Strict dispose enforcement: handles become unusable after instance dispose.

### 0.2 Non-goals (v0)

- State mutation **MUST NOT** schedule or trigger component update/render automatically.
- State `get()` **MUST NOT** create implicit subscriptions/dependency tracking.

---

## 1. Terminology

- **State slot**: a single semantic state value stored in the component instance.
- **semantic**: a human-readable label string passed at definition time.
- **OwnedStateHandle<V>**: the handle returned by `def.state.*` for a slot.
- **setup**: prototype setup execution phase (where `def` is valid).
- **runtime**: any execution outside setup (callbacks/render-time context boundaries are enforced by SystemCaps).
- **disposed**: instance has been torn down; module hub has been disposed and caps are invalid.

> Phase enforcement is provided by SystemCaps / exec-phase guard (see: `runtime.exec-phase-guard.v0.md`).

---

## 2. Facade: definition APIs (setup-only)

State slots are defined via `def.state.*`.

### 2.1 Requirements

- Each definition **MUST** take `semantic: string`.
- Each definition **MUST** return an `OwnedStateHandle<V>`.

### 2.2 Supported definitions (v0)

- `def.state.bool(semantic, defaultValue)`
- `def.state.enum(semantic, defaultValue, spec)`
- `def.state.string(semantic, defaultValue, spec?)`
- `def.state.numberRange(semantic, defaultValue, spec)`
- `def.state.numberDiscrete(semantic, defaultValue, spec?)`

### 2.3 Setup-only enforcement

Calling `def.state.*` outside setup **MUST** throw.

---

## 3. Handle operations (OwnedStateHandle)

### 3.1 Shape (v0)

`OwnedStateHandle<V>` returned by `def.state.*` **MUST** provide:

- `get(): V`
- `setDefault(v: V): void`
- `set(v: V, reason?: StateSetReason): void`

### 3.2 Phase rules (v0)

- `get()`:
  - Allowed in setup and runtime.
- `setDefault(v)`:
  - Setup-only.
  - Calling in runtime **MUST** throw.
- `set(v, reason?)`:
  - Runtime-only.
  - Calling in setup **MUST** throw.

### 3.3 Dispose rules (v0)

After instance dispose:

- `get()` **MUST** throw
- `setDefault()` **MUST** throw
- `set()` **MUST** throw

During `unmounted` callback (while instance is still alive), handle operations are allowed.

---

## 4. Rendering interaction rules (v0)

### 4.1 No implicit re-render

State mutation **MUST NOT** trigger a render/commit automatically.

- If a state value changes after mount, the DOM output MUST remain unchanged until an explicit update is requested by the host/controller (`update()`).

### 4.2 Visibility to initial render

A state mutation performed in the `created` callback happens before the first commit and therefore:

- The initial render **MUST** observe the updated state value (created-time set is visible to first render).

> v0 does not define any setup-time mutation visibility rules besides enforcing phase:
> setup-time `set()` is invalid and MUST throw.

---

## 5. Events / watch / subscribe (not in v0)

v0 does **NOT** specify:

- `watch(cb)` registration or callback delivery semantics
- app-side `subscribe(cb)` semantics
- disconnect events
- value-domain validation / spec enforcement
- semantic format constraints or collision detection
- capability profiles (owned/borrowed/observed)
- expose integration

These are deferred to v1+ (see Roadmap).

---

## 6. Error model (v0)

### 6.1 Phase violations

Implementations **MUST** throw on phase violations described in §3.2.

Minimum diagnostic requirements:

- include `prototypeName`
- include `op` (operation label)
- include `expected` and `actual` phase/domain information (directly or indirectly)

Exact error typing/codes are not required in v0.

### 6.2 Dispose violations

Implementations **MUST** throw when invoking handle operations after dispose (§3.3).

---

## 7. Contract tests (v0 minimum coverage)

Implementations MUST be validated for:

1. `def.state.*` is setup-only and returns handle with `get/setDefault/set`.
2. Phase enforcement:
   - `setDefault` throws in runtime
   - `set` throws in setup
3. Rendering interaction:
   - created-time `set` is visible to initial render
   - mounted-time `set` does NOT re-render until explicit `update()`
4. Dispose enforcement:
   - handles are usable during `unmounted` callback
   - after dispose, `get/setDefault/set` all throw

---

## 8. Roadmap (v1+; non-normative)

Potential extensions (not part of v0):

- semantic format constraints and collision detection
- spec validation (options/min/max/step/clamp)
- notification semantics and deterministic re-entrancy delivery
- prototype-side `watch` and app-side `subscribe`
- capability profiles (owned/borrowed/observed) and hook promotion
- expose mapping integration and external projections
- structured error codes/classes
