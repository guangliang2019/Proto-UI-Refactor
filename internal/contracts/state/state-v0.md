# state.v0.md

> Status: Draft – implementation-ready (contract-first)
> This contract specifies Proto UI **state**: semantic state slots, visibility, handles, events, lifecycle, and integrations.

---

## 0. Scope & Non-goals

### 0.1 Scope

State provides:

- Semantic state slots (state-machine leaning) with explicit specs and validation.
- `StateId` (internal identity) + required `semantic` (human semantic label).
- Handle-based capabilities (get/set/watch/subscribe) with strict phase rules.
- Integration points for `expose` and `rule`.

### 0.2 Non-goals

- State mutation **MUST NOT** schedule component update.
- Implementations **MUST NOT** do implicit dependency tracking from reads (`get()`).

---

## 1. Terminology

- **StateSpec**: structured type+constraint declaration.
- **StateId**: internal unique identifier for a state slot, stable within an instance.
- **semantic**: required semantic label (see §6).
- **Visibility**: private / protected / public.
- **Prototype-side**: within prototype runtime, has `run` handle.
- **App-side**: external consumer, no `run` handle.

### 1.1 Hook installation context

Hook installation context exists only when a hook is installed via official facilities (e.g. `defineAsHook`).
Promotion decisions are based on **dynamic execution context**, not call-site location.

---

## 2. Facade: definition APIs

State slots are defined via `def.state.*`.

- Each definition **MUST** take `semantic: string`.
- Each definition **MUST** record provider metadata (origin prototype/hook).
- Each definition returns a state handle whose visibility depends on context (§5).

Supported spec categories (v0):

- `bool`
- `enum` (string enum)
- `string` (strict fallback)
- `number.range`
- `number.discrete`

---

## 3. Handles & capabilities

### 3.1 Common operations

- `get(): V`

  - Allowed in setup and runtime.
  - **MUST NOT** create subscriptions or implicit dependencies.

- `setDefault(v: V)`

  - Setup-only.

- `set(v: V, reason?: StateSetReason)`

  - Runtime-only.
  - Emits notifications when the value changes (§9).

- `watch(cb)`

  - Setup-only registration; callback runs at runtime.
  - Prototype-scoped (auto-cleanup on unmount).

- `subscribe(cb)`

  - Runtime-allowed registration (app-side only).
  - External-scoped; caller owns cleanup; additionally instance disconnect auto-unsubscribes (§10).

### 3.2 Capability matrix

#### private

- get ✅
- setDefault ✅ (setup-only)
- set ✅ (runtime-only)
- watch ❌
- subscribe ❌

#### protected

- get ✅
- setDefault ✅ (setup-only)
- set ✅ (runtime-only)
- watch ✅ (setup-only register; runtime callback; auto-cleanup)
- subscribe ❌

#### public (prototype-side handle)

- get ✅
- watch ✅ (setup-only register; runtime callback; auto-cleanup)
- set ❌
- subscribe ❌

#### public (app-side handle)

- get ✅
- subscribe ✅ (runtime-allowed; no dedup; manual cleanup; auto-unsubscribe on disconnect)
- set ❌
- watch ❌

> Rule: `watch` is prototype-lifecycle scoped; `subscribe` is external/app scoped. They are different handle shapes.

---

## 4. Phase rules (setup vs runtime)

### 4.1 Setup-only APIs

- `watch(...)`
- `setDefault(...)`

### 4.2 Runtime-only APIs

- `set(...)`

### 4.3 Enforcement

- Calling setup-only APIs in runtime **MUST** throw.
- Calling runtime-only APIs in setup **MUST** throw.

---

## 5. Visibility rules & promotion

### 5.1 Default visibility

- A state defined in a normal component setup is **private** by default.

### 5.2 Hook promotion

- If a state is defined under hook installation context, it **MUST** be treated as **protected** for the hook caller.

### 5.3 Public states

- A state **MUST NOT** become public by definition alone.
- Only `expose(state)` (or equivalent) can produce a public state.

### 5.4 Write protection

- App-side consumers **MUST NOT** obtain writable handles via any legal path.

---

## 6. semantic format & collision rules

### 6.1 semantic format

- `semantic` is required.
- `semantic` is a dotted path of segments: `seg1.seg2.seg3`.
- Each segment **MUST** be `kebab-case` (`[a-z0-9]+(-[a-z0-9]+)*`).
- `.` is the only segment delimiter.

### 6.2 Collision domain

Collision checks apply within a single component instance’s state registry, including:

- local states
- hook-injected states (transitively)

### 6.3 Collision policy

- Two distinct state slots with the same `semantic` **MUST** fail fast during setup (throw).
- Hooks **MUST NOT** auto-prefix semantics to avoid collisions.
- Resolving semantic collisions is a **Component Author responsibility** (e.g. choose different hooks, rename semantics, or otherwise avoid conflict).

### 6.4 Diagnostics requirements

Thrown errors **MUST** include:

- the conflicting `semantic`
- origin/provider info (which hook/prototype introduced it)
- a minimal provider chain (who brought it in)

---

## 7. Spec semantics & value domain

### 7.1 Value domain

- State values **MUST NOT** be `null` or `undefined`.
- Values **MUST** satisfy their declared spec; invalid values **MUST** throw.

### 7.2 bool

- Value must be boolean.

### 7.3 enum (string)

- `options: readonly string[]` is required.
- Values outside `options` must throw.

### 7.4 string (strict fallback)

- `options: readonly string[]` is required.
- Values outside `options` must throw.

> Non-normative: `string` is a discouraged fallback; strictness is intentional friction.

### 7.5 number.range

- Fields: `min`, `max`, `clamp?: boolean`
- If clamp=true: clamp out-of-range.
- Otherwise: out-of-range must throw.

### 7.6 number.discrete

- Fields: `options?`, `min?`, `max?`, `step?`
- Precedence:

  - If `options` exists, it is authoritative; values in `options` are valid even outside `min/max/step`.
  - If no `options`, `min/max/step` define validity; invalid values must throw.

---

## 8. Events & callbacks

### 8.1 Set reason

- `set(v, reason?)` may carry a reason.
- Reasons are opaque to state core; they are surfaced to watchers/subscribers as-is.

`StateSetReason` is intentionally loose:

- `type StateSetReason = unknown`

### 8.2 Event union (v0)

`StateEvent<V> = StateNextEvent<V> | StateDisconnectEvent`

- `StateNextEvent<V>`:

  - `type: 'next'`
  - `next: V`
  - `prev: V`
  - `reason?: StateSetReason`

- `StateDisconnectEvent`:

  - `type: 'disconnect'`
  - `reason: DisconnectReason`

### 8.3 Prototype-side watch callback signature

Prototype runtime callbacks **MUST** take `run` as the first parameter.

- `watch(cb)` registers:

  - `cb: (run, e: StateEvent<V>) => void`

### 8.4 App-side subscribe callback signature

External callbacks have no `run` handle:

- `subscribe(cb)` registers:

  - `cb: (e: StateEvent<V>) => void`

---

## 9. Notification semantics

### 9.1 When notifications fire

- `watch/subscribe` callbacks fire **only when the value changes**.
- Change detection **MUST** use `Object.is(prev, next)`.

  - If `Object.is(prev, next)` is true, no `next` event is emitted.

### 9.2 No coalescing / no merging

- For a sequence of value changes, each successful change emits exactly one `next` event.
- Implementations **MUST NOT** merge multiple changes into one event.

### 9.3 Re-entrancy

If callbacks trigger additional `set(...)` during notification delivery:

- Value changes apply immediately (`get()` reflects latest).
- Implementations **MUST NOT** deliver nested notifications synchronously.
- Additional notifications **MUST** be queued and delivered after the current delivery completes (FIFO).

---

## 10. Lifecycle & resource management

### 10.1 Prototype-side watch cleanup

- Prototype-side watches **MUST** be auto-cleaned on component unmount.

### 10.2 App-side subscribe rules

- `subscribe` **MUST NOT** deduplicate callbacks.

  - Each call creates a distinct subscription record.

- `unsubscribe()` **MUST** be idempotent.

### 10.3 Disconnect behavior

Subscriptions are instance-bound in v0.

When the source component instance disconnects/unmounts, the implementation **MUST**:

1. auto-unsubscribe all app-side subscriptions for that instance
2. deliver a final `{ type:'disconnect', reason }` event to each subscriber
3. release callback references (no retention)

`DisconnectReason` (v0):

- `unmount`

No subscription inheritance:

- Remounting a component **MUST NOT** reattach prior subscriptions.

---

## 11. Expose integration

### 11.1 Ownership

- Mapping configuration belongs to `expose`, not `state`.
- State contract does not define mapping targets or serialization formats.

### 11.2 Mapping timing

If a public state is mapped by expose:

- Mapping side effects **MUST** be applied synchronously within `set(...)` (before it returns).
- This does not schedule component update.

---

## 12. Error model

Implementations **MUST** throw for:

- Phase violations
- Spec violations
- Semantic collisions
- Illegal capability access (e.g. setting public state)

### 12.1 Error typing (minimum requirement)

Errors **MUST** be distinguishable by type or code.
At minimum, implementations must provide one of:

- `error.code` string, or
- a stable error class/type per category.

Recommended codes (v0):

- `STATE_PHASE_VIOLATION`
- `STATE_SPEC_VIOLATION`
- `STATE_SEMANTIC_COLLISION`
- `STATE_CAPABILITY_VIOLATION`

---

## 13. Contract tests (minimum coverage checklist)

Implementations MUST be validated for:

1. Spec validation (valid/invalid) for all categories.
2. Phase enforcement for setup/runtime APIs.
3. Hook promotion: private → protected in hook installation context.
4. Semantic collision detection + provider diagnostics.
5. Notification semantics:

   - only on change (Object.is)
   - no coalescing
   - prev/next + reason surfaced
   - re-entrancy queueing

6. Prototype-side watch auto-cleanup on unmount.
7. App-side subscribe:

   - no dedup
   - unsubscribe idempotent
   - disconnect emits final event + releases callbacks

8. Expose mapping timing: synchronous within `set(...)`.
