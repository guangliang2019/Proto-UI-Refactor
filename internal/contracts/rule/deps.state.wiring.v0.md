# internal/contracts/rule/deps.state.wiring.v0.md

> Status: Draft – normative
> This contract defines **how rule evaluation is wired to state changes**.
>
> Its purpose is to guarantee that rules behave as _state-driven declarative logic_,
> regardless of state visibility (private / protected / public).

---

## 1. Scope

This contract specifies:

- how state dependencies participate in rule evaluation
- when rule re-evaluation MUST occur
- what guarantees the runtime provides when a state changes

This contract does **not** define:

- which states may be referenced (see `deps.state.visibility.v0.md`)
- how rule intent is realized (see `intent.v0.md`)
- how state values are defined or mutated (see `state-v0.md`)

---

## 2. Rule dependency model

### 2.1 Dependency declaration

A rule declares its dependencies via RuleIR.

If RuleIR contains a reference to a state:

- that state MUST be treated as a reactive dependency
- the dependency is based on the **state value**, not on callbacks or subscriptions

### 2.2 Value access

During rule evaluation:

- the runtime MUST read the current value of each dependent state via `state.get()`
- no implicit caching of values is permitted across evaluations unless explicitly documented

---

## 3. Re-evaluation triggers

### 3.1 State change trigger

If any state referenced by a rule transitions from `prev` to `next`:

- the runtime MUST schedule a re-evaluation of that rule
- this requirement applies regardless of:

  - state visibility (private / protected / public)
  - the origin of the state (prototype-defined or injected)

A state transition is defined as `prev !== next` according to the state’s equality rules.

### 3.2 No coalescing requirement

- The runtime MUST NOT assume that multiple state changes can be safely coalesced.
- Re-evaluation MAY be batched for performance, but semantic correctness MUST NOT depend on batching.

---

## 4. Phase interaction

### 4.1 Evaluation phase

Rule re-evaluation occurs during runtime execution phases.

- Evaluation MUST NOT occur during setup-only phases.
- The runtime MUST ensure phase correctness before invoking rule evaluation.

### 4.2 Interaction with update cycles

If the host runtime defines an update or callback cycle:

- rule re-evaluation MAY be aligned to that cycle
- however, the semantics MUST be equivalent to evaluating after every relevant state change

---

## 5. Visibility independence

Rule wiring MUST be independent of state visibility.

Specifically:

- private state MUST trigger rule re-evaluation if referenced
- protected state MUST trigger rule re-evaluation if referenced
- public state MUST trigger rule re-evaluation if referenced

The prohibition on `watch` for private state MUST NOT weaken rule reactivity.

---

## 6. Error handling

The runtime MUST report errors when:

- rule evaluation attempts to access a state that is no longer valid
- phase violations occur during re-evaluation

Error reporting SHOULD include:

- rule identity
- state identity
- current runtime phase

---

## 7. Non-goals

This contract does NOT:

- define evaluation ordering between multiple rules
- define rule priority or conflict resolution
- require synchronous evaluation
- mandate a specific scheduling strategy

---

## 8. Summary

- Rules are **state-driven**.
- Any referenced state change MUST trigger rule re-evaluation.
- Visibility does not weaken reactivity.
- This wiring ensures rule-first architectures remain declarative and predictable.
