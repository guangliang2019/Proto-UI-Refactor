# rule/when.expr.v0.md

# rule.when — Condition Expression Contract (v0)

## Purpose

This contract defines the condition language used by rule declarations.

Conditions are declarative, analyzable, and dependency-tracked.

---

## WhenExpr AST (v0)

```ts
type WhenExpr<Props> =
  | { type: "true" }
  | { type: "false" }
  | { type: "eq"; left: WhenValue<Props>; right: WhenLiteral }
  | { type: "not"; expr: WhenExpr<Props> }
  | { type: "all"; exprs: WhenExpr<Props>[] }
  | { type: "any"; exprs: WhenExpr<Props>[] }
  | { type: "happens"; eventType: string };
```

```ts
type WhenValue<Props> =
  | { type: "prop"; key: keyof Props }
  | { type: "state"; id: StateId }
  | { type: "context"; key: ContextKey<any> };

type WhenLiteral = string | number | boolean | null;
```

---

## WhenBuilder Rules

`WhenBuilder` is setup-only and MUST record dependencies.

```ts
w.prop(key)   -> { kind: "prop", key }
w.state(s)    -> { kind: "state", id: s.id }
w.ctx(key)    -> { kind: "context", key }
w.event(type) -> { kind: "event", type }
```

Dependency recording MUST be:

- complete
- de-duplicated
- deterministic (first-seen order recommended)

---

## eq Semantics

- Uses JS strict equality (`===`)
- No deep comparison in v0

---

## Logical Operators

- `all([])` => true
- `any([])` => false
- Evaluation MUST follow logical truth tables

---

## happens(eventType) — Trigger Gate

- `happens` is not a stable boolean
- It becomes true for exactly one evaluation cycle after the event occurs
- It resets to false afterwards

In v0:

- The AST MUST be accepted
- Dependencies MUST be recorded
- Runtime MAY choose not to execute transient intents yet

---

## Invariants

- Expression evaluation MUST be pure
- No side effects during evaluation
- Identical inputs MUST yield identical results
