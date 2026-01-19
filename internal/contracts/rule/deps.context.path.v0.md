# internal/contracts/rule/deps.context.path.v0.md

> Status: Draft – normative
> This contract defines **how rules may reference context values**, including
> structured access to properties within a context value.
>
> The goal is to enable context-driven declarative rules while preserving
> serializability, analyzability, and cross-platform portability.

---

## 1. Scope

This contract specifies:

- how context may appear as a rule dependency
- how rule expressions access properties within a context value
- failure semantics for context and path access

This contract does **not** define:

- how context providers are resolved (see context contracts)
- how rule re-evaluation is scheduled (see wiring contracts)
- how rule intent is realized (see `intent.v0.md`)

---

## 2. Context as a rule dependency

### 2.1 Context reference form

A rule MAY reference context values via RuleIR.

A context dependency MUST be represented in RuleIR as:

- a context key (`ContextKey<T>`)
- an optional static access path

Conceptually, a rule depends on the _value_ associated with the resolved provider
of the given `ContextKey`.

---

## 3. Path access model

### 3.1 Path definition

A context access path:

- MUST be a static, ordered list of string keys
- MUST be fully serializable
- MUST NOT contain functions, computed keys, or dynamic expressions

Example (conceptual):

- `ctx(key)` → entire context value
- `ctx(key).path("a", "b", "c")` → nested access

In RuleIR, this is represented as:

```ts
{
  type: "context",
  key: ContextKey<any>,
  path?: string[]
}
```

---

### 3.2 Allowed traversal targets

During evaluation, path traversal:

- MUST only traverse plain objects or arrays
- MUST NOT invoke getters or user-defined functions
- MUST treat the context value as readonly

If a path segment targets a non-object value before the path is exhausted,
the access is considered failed.

---

## 4. Failure semantics

### 4.1 Missing provider

If no provider exists for the referenced `ContextKey`:

- the context value is considered `null`

This applies equally to:

- `trySubscribe`-style optional contexts
- provider disconnection scenarios (v0 does not emit connection change events)

---

### 4.2 Path access failure

If path traversal fails due to:

- missing keys
- non-object intermediate values
- invalid traversal

then the accessed value is `null`.

Rule evaluation MUST continue; failure MUST NOT throw by default.

Rationale:

- rule evaluation should be resilient to partial or optional context
- throwing would make rule behavior brittle under dynamic composition

---

## 5. Equality and comparison

Context-derived values obtained via path access participate in rule conditions
according to the normal rule expression semantics.

No additional equality guarantees are provided beyond those defined by the rule engine.

---

## 6. Readonly-state handling

If a context value or path result is a readonly state handle:

- the rule MUST treat it as an immutable observable value
- mutation APIs MUST NOT be accessible
- rule evaluation MUST observe its current value only

This enables safe propagation of derived or injected state through context.

---

## 7. Diagnostic requirements

Implementations SHOULD provide diagnostics when:

- a rule references a context key with no provider
- a path access consistently resolves to `null`
- a path attempts to traverse a non-serializable structure

Diagnostics MUST NOT alter rule semantics.

---

## 8. Non-goals

This contract does NOT:

- allow dynamic or computed context paths
- permit imperative logic within path access
- guarantee notification on provider changes (see wiring contract)
- define serialization of functions or closures

---

## 9. Summary

- Rules may depend on context values in a fully declarative way.
- Path access is static, serializable, and readonly.
- Missing providers or invalid paths resolve to `null`, not errors.
- This design supports rule-first architectures while preserving portability.
