# internal/contracts/context/with-tree.v0.md

> Status: Draft – implementation-ready (contract-first)
> This contract specifies Proto UI **context**: tree-based provider resolution, setup-only subscription intent, runtime reads, value constraints, and state-handle readonly transformation.

---

## 0. Scope & Non-goals

### 0.1 Scope

Context provides:

- A **tree-based** communication channel between components (provider → consumer).
- Setup-only **subscription intent** and runtime-only **reads**.
- Deterministic provider resolution: **nearest provider wins**.
- Runtime safety constraints for context values (including state-handle readonly transformation).

### 0.2 Non-goals

- Bidirectional/peer communication is out of scope for v0.
- Connection-change notifications (connected/disconnected callbacks) are out of scope for v0.
- Function “serialization” across runtimes is out of scope for v0 (functions may exist as opaque runtime references).

---

## 1. Terminology

- **ContextKey<T>**: a unique token (symbol-like) identifying a context channel.
- **Provider**: a component instance that provides a value for a ContextKey.
- **Consumer**: a component instance that subscribes/reads a ContextKey.
- **Logical tree**: the runtime component tree (for WC it matches DOM tree).
- **Nearest provider wins**: the consumer binds to the closest ancestor provider for the key.

---

## 2. ContextKey

### 2.1 Identity

- ContextKey identity is unique and comparable by reference (symbol-like).
- ContextKeys may be shared via JS modules.

### 2.2 Creation (core-owned)

Core MUST provide a ContextKey factory, e.g.:

- `createContextKey<T>(debugName: string): ContextKey<T>`

`debugName`:

- MUST be present for diagnostics (error messages, debug logs).
- does not affect identity.

---

## 3. Provider resolution

- Provider resolution MUST be based on the logical tree.
- For a given (consumer instance, key), the bound provider is the **nearest ancestor provider** of that key.
- Different component instances may provide the same key simultaneously; binding is per consumer and depends on tree position.

---

## 4. Setup-only subscription intent

Context subscription APIs are setup-only:

- `subscribe(key)` (required)
- `trySubscribe(key)` (optional)

### 4.1 subscribe (required)

- `subscribe(key)` MUST be callable only during setup.
- If no provider is available for that key at setup time, `subscribe(key)` MUST throw.

Assumption in v0:

- Logical tree assembly occurs before context system initialization, so provider availability is known at setup.

### 4.2 trySubscribe (optional)

- `trySubscribe(key)` MUST be callable only during setup.
- If no provider is available at setup time, `trySubscribe(key)` MUST NOT throw.

---

## 5. Runtime-only reads

Read APIs are runtime-only:

- `read(key)` (required subscription)
- `tryRead(key)` (optional subscription)

### 5.1 read (required)

- `read(key)` MUST be callable only during runtime callback phase.
- `read(key)` MUST require prior `subscribe(key)` in setup.
- If the subscription is disconnected at runtime (provider removed / tree changed), `read(key)` MUST throw.

### 5.2 tryRead (optional)

- `tryRead(key)` MUST be callable only during runtime callback phase.
- `tryRead(key)` MUST require prior `trySubscribe(key)` in setup.
- If the subscription is disconnected or provider is absent, `tryRead(key)` MUST return `null`.

> Note: In Proto UI, `undefined` is illegal as a context value.
> In v0, `null` is reserved to represent “no context available” for optional reads.

---

## 6. Provide rules

### 6.1 Provide API phase

- `provide(key, value)` MUST be setup-only.

### 6.2 Duplicate provide per instance

- A component instance MUST NOT provide the same key more than once.
- Duplicate provide MUST throw.

### 6.3 Extension APIs (deferred)

- APIs for extending already-provided values are optional and not required in v0.

---

## 7. Context value constraints

### 7.1 Value domain

- Context values MUST NOT be `undefined`.
- Context values MUST NOT be `null`.
- In v0, `null` is reserved as the “no context” signal returned by `tryRead` when provider is absent or disconnected.

### 7.2 Portability constraints (v0)

Context values SHOULD be “portable-value friendly”:

- JSON-like values (primitives, arrays, plain objects) are recommended.
- Functions MAY be present as opaque runtime references.
- Cross-platform portability of functions is out of scope for v0.

### 7.3 Runtime mutation constraint

- Context values MUST be treated as immutable after setup.
- Adding new keys to provided plain objects during runtime is prohibited by contract.

Implementations MUST perform at least one validation pass at provide-time.
(Deep runtime proxy enforcement is optional; not required in v0.)

---

## 8. State-handle readonly transformation

If a context value contains any state handle(s), the runtime MUST transform them to readonly handles before exposing to consumers.

Readonly state handle properties:

- MUST NOT provide: `set`, `setDefault`, `watch`, `subscribe`
- MUST provide: `get`
- MAY provide metadata if available (e.g. semantic/spec/id)

Transformation scope:

- MUST recursively traverse arrays and plain objects to find and transform embedded state handles.
- For non-plain objects (class instances), behavior is implementation-defined; portability is not guaranteed.

---

## 9. Tree changes & re-binding

- Provider/consumer bindings MAY change if the logical tree changes.
- v0 provides no explicit notification callbacks for re-binding.
- Runtime reads enforce correctness:

  - required `read` throws when disconnected
  - optional `tryRead` returns `null` when disconnected or absent

---

## 10. Error model

Implementations MUST throw for:

- Phase violations (setup-only/runtime-only misuse)
- Missing provider for required `subscribe`
- Missing prior subscription intent (`read` without `subscribe`, `tryRead` without `trySubscribe`)
- Duplicate provide for the same key on the same instance
- Disconnected required read

### 10.1 Error typing (minimum)

Errors MUST be distinguishable by type or code (e.g. `error.code`).

Recommended codes (v0):

- `CONTEXT_PHASE_VIOLATION`
- `CONTEXT_PROVIDER_MISSING`
- `CONTEXT_SUBSCRIPTION_REQUIRED`
- `CONTEXT_DUPLICATE_PROVIDE`
- `CONTEXT_DISCONNECTED`
