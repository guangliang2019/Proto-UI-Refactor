# internal/contracts/rule/deps.state.visibility.v0.md

> Status: Draft – normative
> This contract defines **which states a rule is allowed to depend on**, and what that dependency implies.
>
> This contract is intentionally conservative about _mutation_ and intentionally permissive about _observation_,
> in order to support rule-first component design without introducing imperative logic channels.

---

## 1. Scope

This contract specifies:

- which kinds of state a rule MAY reference
- how state visibility affects rule dependency legality
- guarantees provided when a rule depends on a given state
- explicit non-goals for v0 (especially mutation intents)

This contract does **not** define:

- how rule evaluation is triggered (see `deps.state.wiring.v0.md`)
- how states are defined or exposed (see `state-v0.md`)
- how rule intent is realized (see `intent.v0.md`)

---

## 2. Terminology

- **State**: a state instance defined via `def.state.*`, identified internally by `StateId`
- **Visibility**:

  - _private_: state defined by the prototype, not injected by asHook
  - _protected_: state injected by asHook or upgraded from private
  - _public_: state exposed via expose channel

- **Rule dependency**: a state referenced by RuleIR and used as an input to `when` evaluation

---

## 3. Allowed state dependencies

### 3.1 General rule

A rule MAY depend on any state that is **lexically and semantically available** to the defining prototype.

This includes:

- private state
- protected state
- public state

provided that the state is reachable within the prototype’s definition scope.

### 3.2 Private state dependency

A rule MAY depend on private state.

This is explicitly allowed even though:

- private state MUST NOT expose a `watch` API to component authors
- private state MUST NOT be directly observable via callbacks

Rationale:

- rule is declarative, planned, and side-effect constrained
- allowing rule to observe private state enables internal state machines to drive style and other intents without leaking abstraction boundaries

---

## 4. Guarantees for dependent states

If a rule depends on a state (of any visibility):

- the runtime MUST treat that state as a reactive dependency
- changes to that state MUST be capable of triggering rule re-evaluation (see wiring contract)
- the rule MUST observe the state value via `get()`, not via callbacks

This applies equally to private, protected, and public states.

---

## 5. Explicit restrictions (v0)

### 5.1 No mutation intents

In v0, rule intent MUST NOT include:

- setting state values
- invoking state mutation APIs
- indirect mutation through callbacks

Even when a rule depends on private state, it MUST remain purely observational.

### 5.2 No imperative logic

Rule dependency on private state MUST NOT be interpreted as permission to encode imperative logic.

Rule intent MUST remain:

- declarative
- serializable
- analyzable

Any behavior that requires imperative sequencing or history-dependent logic MUST be implemented via explicit state machines or runtime callbacks.

---

## 6. Diagnostic requirements

When a rule depends on private state, implementations SHOULD provide diagnostic information that includes:

- the semantic name of the state (if available)
- its visibility (private/protected/public)
- its originating prototype or asHook

This requirement exists to prevent silent coupling between internal state and rule behavior.

---

## 7. Non-goals

This contract does NOT:

- grant private state any additional APIs
- weaken the prohibition on private state `watch`
- define rule evaluation frequency or scheduling
- define rule priority or conflict resolution

These concerns are addressed by other contracts.

---

## 8. Summary

- Rule dependency is **observation**, not control.
- Private state MAY drive rule behavior.
- Rule MUST remain declarative and mutation-free.
- This design enables rule-first component architectures without collapsing abstraction boundaries.
