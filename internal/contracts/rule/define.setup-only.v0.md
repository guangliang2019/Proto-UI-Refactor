# rule.define — Setup-only Declaration Contract (v0)

## Purpose

This contract defines how rules are **declared during setup** and compiled
into RuleIR.

Rule declarations are static and must not depend on runtime state.

---

## API Shape

```ts
def.rule(spec: RuleSpec<Props>): void
```

Calling `def.rule` outside of setup **MUST throw**.

---

## RuleSpec (v0)

```ts
type RuleSpec<Props> = {
  label?: string;
  note?: string;

  // Optional ordering key; larger values apply later
  priority?: number;

  when: (w: WhenBuilder<Props>) => WhenExpr<Props>;
  intent: (i: IntentBuilder) => void;
};
```

Rules:

- `when` MUST be constructed using `WhenBuilder` only
- `intent` MUST be constructed using `IntentBuilder` only
- RuleSpec MUST be fully static during setup
- No runtime closures may escape into RuleIR

---

## Compilation Result: RuleIR

Defining a rule MUST produce a RuleIR object:

```ts
type RuleIR<Props> = {
  label?: string;
  note?: string;
  priority?: number;

  deps: RuleDep<Props>[];
  when: WhenExpr<Props>;
  intent: RuleIntent;
};
```

### RuleIR Invariants

- RuleIR MUST be pure data
- RuleIR MUST be serializable in principle
- RuleIR MUST NOT contain functions or host references

---

## Ordering Semantics (v0)

When multiple rules are active:

1. Rules are ordered by `(priority ?? 0)`
2. Ties are resolved by declaration order

Intents are applied following this deterministic order.

Conflict resolution is delegated to semantic merge.

---

## Errors

The following MUST throw synchronously:

- calling `def.rule` outside setup
- using non-builder values inside `when`
- using unsupported operations inside `intent`
