# internal/contracts/rule/deps.context.wiring.v0.md

> Status: Draft – normative
> This contract defines **how rule evaluation is wired to context dependencies**.
>
> Unlike state, context does not emit fine-grained change notifications in v0.
> This contract therefore specifies a conservative and predictable re-evaluation
> strategy to prevent stale rule behavior.

---

## 1. Scope

This contract specifies:

- when rules that depend on context MUST be re-evaluated
- how context dependency affects rule scheduling
- guarantees provided to rule authors in the absence of context change signals

This contract does **not** define:

- how context providers are resolved (see context contracts)
- how context values are structured (see `deps.context.path.v0.md`)
- how rule intent is realized (see `intent.v0.md`)

---

## 2. Context dependency model

### 2.1 Nature of context dependency

In v0:

- context values are resolved via provider lookup along the logical tree
- context values are treated as readonly
- context does NOT provide intrinsic change notifications
- provider connection/disconnection events are NOT surfaced to rule runtime

Therefore, context dependencies MUST be treated as **potentially unstable inputs**.

---

## 3. Re-evaluation strategy (v0)

### 3.1 Mandatory conservative strategy

If a rule’s dependency set includes at least one context reference:

- the runtime MUST treat the rule as **context-dependent**
- the runtime MUST re-evaluate the rule on **every runtime update cycle**

This requirement applies regardless of:

- whether the context provider actually changed
- whether the resolved context value is referentially stable
- whether the accessed path resolves to `null`

Rationale:

- prevents rules from silently capturing stale context values
- avoids coupling rule semantics to tree-change detection mechanisms in v0

---

### 3.2 Interaction with state dependencies

If a rule depends on both:

- one or more states, and
- one or more context values

then:

- state changes MUST still trigger rule re-evaluation (see `deps.state.wiring.v0.md`)
- context dependency does NOT suppress or replace state-driven triggers
- the conservative context strategy applies in addition to state triggers

---

## 4. Phase and scheduling constraints

### 4.1 Evaluation phase

Rule re-evaluation due to context dependency:

- MUST occur during runtime phases
- MUST NOT occur during setup-only phases

### 4.2 Scheduling freedom

The runtime MAY:

- batch multiple re-evaluations within a single update cycle
- align evaluation with existing host or runtime scheduling loops

However:

- semantic equivalence to “evaluated on every update cycle” MUST be preserved

---

## 5. Diagnostics

Implementations SHOULD provide diagnostics indicating that:

- a rule is context-dependent
- conservative re-evaluation is in effect

This diagnostic information is intended to:

- aid performance analysis
- guide authors toward state-based refactoring when appropriate

Diagnostics MUST NOT alter rule semantics.

---

## 6. Forward compatibility notes (non-normative)

Future versions MAY introduce:

- provider connection change notifications
- fine-grained context dependency tracking
- selective re-evaluation strategies

Such enhancements MUST NOT change the observable semantics defined by this v0 contract.

---

## 7. Non-goals

This contract does NOT:

- require detection of provider relocation
- mandate equality comparison of context values
- allow rules to mutate context
- define how context values are cached

---

## 8. Summary

- Context dependencies are treated as unstable inputs in v0.
- Any rule depending on context MUST be re-evaluated every update cycle.
- This conservative strategy guarantees correctness without introducing hidden coupling.
- Future optimizations remain possible without breaking semantics.
