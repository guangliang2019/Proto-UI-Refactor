# rule.intent — Controlled Intent Contract (v0)

## Purpose

This contract defines the **only allowed intent declarations** inside a rule.

Intents describe _what should be active_, not _how it is realized_.

---

## IntentBuilder (v0)

```ts
interface IntentBuilder {
  feedback: {
    style: {
      use(...handles: StyleHandle[]): void;
    };
  };
}
```

Rules:

- IntentBuilder is setup-only
- It is used only to **record intent ops**, not to apply feedback

---

## RuleIntent (v0)

```ts
type RuleIntent = {
  kind: "ops";
  ops: RuleOp[];
};

type RuleOp = { kind: "feedback.style.use"; handles: StyleHandle[] };
```

- Multiple ops MAY be recorded per rule
- Order of ops MUST be preserved

---

## Supported Handles (v0)

- Only Tailwind-style `tw` handles are allowed
- Token syntax rules follow feedback v0 constraints

Unsupported handle kinds MUST throw during compilation.

---

## No Runtime Feedback Writes

Rule runtime MUST NOT call `def.feedback.style.use`.

Feedback is setup-only and frozen after setup.
Rule operates on exported Plans, not feedback recorders.

---

## Non-goals (v0)

- Arbitrary effects
- Author-provided callbacks
- Host-specific realization logic

These concerns belong to adapters or future effect modules.
