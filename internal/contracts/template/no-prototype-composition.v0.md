# Template Contract: No Prototype-Level Composition (v0)

## Status

- Version: v0
- Scope: **Template** (render output language)
- Applies to: official adapters/compilers for Proto UI

## Summary

In v0, Proto UI **does not define** prototype-level composition inside Template.
A TemplateNode MUST NOT use `PrototypeRef` as its `type`.

Composition is expected to happen in the host layer (React/Vue/WC/Vanilla, etc.).

## Required Adapter Behavior (Normative)

### Rule

If an adapter encounters a TemplateNode whose `type` is a `PrototypeRef`, it MUST throw an error.

### Required Error Signature (v0)

- Error message MUST be exactly:

`[Template] PrototypeRef is not allowed in Template v0.`

This is required so contracts can be mechanically verified across adapters.

### Notes

- This contract specifies **rejection semantics**, not authoring convenience.
  Even if advanced users can construct invalid Template objects via `as any`,
  official adapters MUST reject them deterministically.
- Adapters MUST NOT attempt to “support” PrototypeRef composition indirectly.

## Rationale

Proto UI is a split-plane protocol between:

- the **Prototype ecosystem** (Component Authoring: interaction semantics),
- and the **Adapter/Compiler ecosystem** (host integration).

Prototype-level composition is intentionally excluded because it:

1. increases adapter/compiler complexity across hosts,
2. pushes Proto UI toward a framework-like authoring model,
3. adds little semantic value when `slot` + `context` + host composition already cover most needs,
4. blurs the mental model: a Prototype is “inventing a new host element”.

Proto UI prioritizes **stable, strict semantics** over authoring convenience.

## Definition (Informative)

### Allowed TemplateNode.type (v0)

- `string` (host element tag)
- `ReservedType` (e.g. `{ kind: "slot" }`)

### Disallowed TemplateNode.type (v0)

- `PrototypeRef`
