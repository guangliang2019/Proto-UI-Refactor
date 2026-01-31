# internal/contracts/event/event.runtime.v0.md

> **Status**: Draft – implementation-ready
> **Version**: v0
>
> This document specifies the **runtime-level contract** for the Proto UI event
> information flow: execution phase guarantees, dispatch ordering, and integration
> with other runtime subsystems.

---

## Layering Note (Normative)

This contract applies to the **runtime integration** of the event system.

It defines the obligations of the runtime when:

- binding event listeners
- dispatching host events
- invoking user-defined callbacks

It does **not** define:

- setup-time registration semantics (`def.event`)
- module-internal event storage or binding strategies
- adapter-specific target resolution

---

## 0. Responsibilities and Scope

### 0.1 Responsibilities (Normative)

The runtime MUST:

- bind event listeners at a well-defined lifecycle point
- route host events through a controlled dispatch mechanism
- enforce execution phase guarantees for event callbacks
- integrate event dispatch with other runtime subsystems
  (e.g. props, lifecycle callbacks)
- ensure deterministic ordering relative to other runtime effects

### 0.2 Out of Scope

This contract does not prescribe:

- how event modules internally bind or store listeners
- how adapters surface native events
- how event callbacks are authored or structured by users

---

## 1. Binding Time and Lifecycle Integration

### 1.1 Binding point

Event listeners MUST be bound **after** the component instance becomes reachable.

Normative requirements:

- The runtime MUST NOT bind event listeners before:

  - the initial render commit completes
  - the instance is considered reachable by the host

- The runtime MAY invoke the binding step unconditionally,
  relying on the event module’s no-op guarantees when no registrations exist.

> _Informative:_
> This typically corresponds to a lifecycle point similar to
> `instance:reachable` or equivalent.

---

## 2. Event Dispatch Semantics

### 2.1 Dispatch indirection

When a host event occurs:

- The event module forwards the event to the runtime via an opaque
  **dispatch mechanism**, identified by a registration identifier.
- The runtime is responsible for resolving the identifier to a user callback
  and invoking it with the correct runtime context.

The runtime MUST treat the dispatch mechanism as **the sole entry point**
for host-originated events.

---

### 2.2 Execution phase enforcement (Normative)

All user-defined event callbacks MUST be executed in the
**runtime callback phase**.

Rules (normative):

- Before invoking an event callback, the runtime MUST enter callback phase.
- After the callback invocation completes, the runtime MUST exit callback phase.
- Event callbacks MUST NOT be executed during render or setup phases.

> _Rationale:_
> This ensures consistency with other runtime-driven effects
> (e.g. lifecycle hooks, state updates).

---

## 3. Integration with Props and Other Subsystems

### 3.1 Props synchronization before event callbacks

Before invoking an event callback, the runtime MUST:

1. synchronize props state from the host
2. flush any pending props-related tasks or watchers

This MUST occur **before** the event callback is invoked.

Rules (normative):

- Event callbacks MUST observe the latest host-provided props state.
- Props watchers triggered by host updates MUST be processed
  before the event callback runs.

> _Informative:_
> This prevents subtle ordering bugs where event callbacks
> observe stale props values.

---

### 3.2 Interaction with lifecycle callbacks

Event callbacks:

- MUST follow the same phase rules as other runtime callbacks
- MUST NOT interleave with render execution
- MAY schedule further runtime work (e.g. updates) via the runtime handle

The runtime MUST ensure that event callbacks do not violate
the ordering guarantees of lifecycle callbacks (`created`, `mounted`,
`updated`, `unmounted`).

---

## 4. Error Containment and Isolation

### 4.1 Dispatch robustness

If an event is dispatched for an unknown or already-removed registration:

- The runtime MUST treat the dispatch as a no-op.
- No error MUST be thrown.

> _Rationale:_
> This accommodates benign races between event unbinding and host event delivery.

---

### 4.2 Error propagation

Errors thrown inside user-defined event callbacks:

- MUST propagate according to the runtime’s standard error handling policy
- MUST NOT corrupt the internal state of the event system
- MUST NOT leave the runtime in an incorrect execution phase

The runtime MUST ensure that phase state is restored
even if an event callback throws.

---

## 5. Unbinding and Teardown

### 5.1 Unbinding on unmount

Before a component instance is fully unmounted:

- The runtime MUST instruct the event module to unbind all listeners.
- No further event dispatch MUST occur for the instance after unbinding.

### 5.2 Registry cleanup

If the runtime maintains any intermediate structures
(e.g. dispatch registries or identifier maps):

- All such structures MUST be cleared on unmount.
- No references to user callbacks or host targets
  MUST be retained after teardown.

---

## 6. Ordering Guarantees (Summary)

For a given host event:

1. Runtime enters callback phase
2. Props are synchronized and flushed
3. Event callback is invoked
4. Runtime exits callback phase

This ordering MUST be preserved in all compliant implementations.

---

## Appendix A: Relation to Executable Contracts (Informative)

This runtime contract is enforced by executable tests covering:

- event dispatch occurring in callback phase
- props synchronization before event callbacks
- no-op behavior for unknown dispatch identifiers
- correct teardown behavior on unmount

Refer to `packages/runtime/test/contract/` for executable specifications.
