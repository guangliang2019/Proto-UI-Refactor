# Rule Contract Index

This directory defines **rule contracts** for Proto UI.

Rule is a **declarative orchestration layer**:

* it observes state, context, and other semantic inputs
* it evaluates pure, serializable conditions (`when`)
* it produces planned, analyzable **intents** (`intent`)
* it MUST NOT execute imperative logic or perform mutation in v0

Rule is designed to be:

* portable across platforms
* analyzable by compilers
* traceable and optimizable at runtime

---

## Design Philosophy

### Rule-first principle

If a behavior can be expressed as a rule, **it SHOULD be expressed as a rule**.

In the ideal case:

* prototypes declare specs (props, state, context, feedback)
* behavioral logic is composed almost entirely of rules
* imperative callbacks are reduced to:

  * feeding state machines
  * bridging host-specific effects

This maximizes:

* cross-platform portability
* semantic transparency
* optimization and compilation opportunities

Rule is intentionally **harder to misuse than callbacks**, even if it may feel
less ergonomic in some cases.

---

## Rule Characteristics (v0)

* **Declarative**: rules describe *what intent applies under which condition*
* **Serializable**: rule IR MUST be representable as pure data
* **Observational**: rules observe inputs but do not mutate them
* **Planned**: rule output is an **intent**, not an immediate effect

In v0, rule intent is intentionally limited to avoid semantic ambiguity.

---

## Contract Set (v0)

### Core rule contracts

* `define.setup-only.v0.md`

  * Rules MUST be defined during setup phase only.

* `when.expr.v0.md`

  * Grammar and semantics of rule conditions.

* `intent.v0.md`

  * Structure and semantics of rule intent.

* `runtime.apply.v0.md`

  * How rule intents are applied at runtime.

---

### State integration

* `deps.state.visibility.v0.md`

  * Which states a rule MAY depend on.
  * Private state MAY be observed by rules.

* `deps.state.wiring.v0.md`

  * State changes MUST trigger rule re-evaluation.

---

### Context integration

* `deps.context.path.v0.md`

  * Declarative access to context values and sub-properties.

* `deps.context.wiring.v0.md`

  * Conservative re-evaluation strategy for context-dependent rules.

---

## Explicit v0 Restrictions

To preserve analyzability and portability, v0 rules MUST NOT:

* mutate state
* invoke arbitrary user callbacks
* depend on non-serializable values
* encode imperative control flow

Any behavior requiring these MUST be expressed via:

* explicit state machines
* runtime callbacks
* or higher-level abstractions built on top of rule

---

## Diagnostics and Observability

Implementations SHOULD provide diagnostics for:

* rule dependency graphs (state/context)
* rule evaluation frequency
* rule intent conflicts or overrides
* context-dependent re-evaluation warnings

These diagnostics are **non-normative** but strongly recommended to support
rule-first development at scale.

---

## Relationship to Other Modules

* **state**: primary observable input channel for rule
* **context**: secondary, tree-scoped observable input
* **feedback**: primary realization target of rule intent in v0
* **event**: feeds state machines; rule does not directly bind events in v0
* **compiler (future)**: rule IR is a first-class compilation target

---

## Forward Compatibility Notes

Future versions of rule MAY introduce:

* additional intent kinds (e.g. controlled state mutation)
* finer-grained context dependency tracking
* priority and conflict resolution semantics
* compiler-driven rule optimization

Such extensions MUST preserve the declarative core defined by v0 contracts.

---

## Summary

Rule is the semantic backbone of Proto UI behavior.

It exists to:

* replace ad-hoc imperative logic
* expose intent as data
* enable cross-platform correctness and optimization

If something *can* be a rule, it probably *should* be a rule.
