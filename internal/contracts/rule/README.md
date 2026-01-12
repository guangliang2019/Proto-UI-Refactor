# Rule Contracts (v0)

## Purpose

The rule module binds **conditions** to **intent declarations**.

A rule describes:

- **when**: a parseable, dependency-tracked condition expression
- **intent**: a controlled, declarative description of what should be active

Rule itself does **not** render UI and does **not** mutate host state.
Rule produces a **Plan** that is consumed by adapters.

In v0, rule exists to validate the minimal composition of:

- observable inputs (props, later state/context/event)
- feedback style intent tokens (Tailwind-flavored subset)
- adapter-side realization of merged tokens on the host

Rule is intentionally declarative and data-oriented.
Its value comes from analyzability and composition, not expressiveness.

---

## Core Principles (v0)

- RuleIR is **pure data**
- Rule does **not** call feedback at runtime
- Rule does **not** touch host or adapter internals
- Rule runtime evaluates inputs → produces a Plan
- Adapters decide **how and when** to realize that Plan

---

## Scope (v0)

### Included

- Setup-only rule declaration: `def.rule(spec)`
- A minimal `WhenExpr` AST with dependency extraction
- A controlled `IntentBuilder`
- RuleIR generation (pure data)
- Runtime evaluation producing a style token Plan

### Explicitly Excluded

- Host-specific selectors or pseudo-classes
- Arbitrary side effects or author-provided callbacks
- Direct DOM or adapter mutation from rule
- Cross-rule conflict resolution beyond deterministic ordering + semantic merge
- Persistent event state beyond minimal trigger gating

---

## Related Contracts

- `feedback/style.use.setup-only.v0`
- `feedback/style.merge.semantic.v0`
- `feedback/style.export.v0`
- `adapter-web-component/feedback.style.apply-to-host.v0`
