# rule.runtime.apply — Evaluation & Plan Contract (v0)

## Purpose

This contract defines how rule runtime evaluates RuleIR against observable
inputs and produces a **Plan**.

Rule runtime does not apply styles or mutate hosts.

---

## Evaluation Model (v0)

Given:

- a set of RuleIR declarations
- current observable values for their dependencies

Rule runtime performs:

1. Evaluate each rule's `when` expression
2. Select active rules
3. Order active rules deterministically
4. Collect intent ops in that order
5. Concatenate style tokens
6. Run semantic merge

---

## Plan Output (v0)

The output of rule runtime is a Plan:

```ts
type RulePlanV0 = {
  kind: "style.tokens";
  tokens: string[];
};
```

- `tokens` MUST be semantic-merged
- An empty token list represents no active style intent

---

## Adapter Consumption

Adapters:

- consume the Plan
- decide scheduling and realization strategy
- ensure the host reflects the latest tokens

Rule runtime MUST NOT:

- call feedback recorders
- touch the host
- schedule rendering

---

## Dependency Wiring (v0 Minimal)

- `deps.kind === 'prop'` MUST be wired to resolved prop observation
- On dependency change, rules MUST be re-evaluated

State, context, and event deps may be stubbed in v0 tests,
but deps MUST be present in RuleIR.

---

## Invariants

- Evaluation MUST be deterministic
- Given identical inputs, the Plan MUST be identical
- Runtime MUST be free of side effects
