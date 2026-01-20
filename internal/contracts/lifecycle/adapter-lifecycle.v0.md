# internal/contracts/lifecycle/adapter-lifecycle.v0.md

This document defines **Adapter Author obligations** and
the **canonical lifecycle checkpoints** used by Proto UI runtime.

> Scope: Adapter authors and runtime wiring.
> Audience: engineers implementing `executeWithHost` or host adapters.

---

## Canonical Timeline (v0)

Adapters must map host behavior into the following **ordered checkpoints**.
Checkpoints must not be skipped or reordered.

### CP0 — `setup:end`

- Prototype setup has completed.
- Modules are created.
- No host resources are assumed available.

---

### CP1 — `host:ready`

- Runtime is bound to a host instance.
- Host-provided resources may be injected as caps.

**Typical uses**:

- attach raw props sources
- attach effect ports
- attach host schedulers or root references

---

### CP2 — `tree:logical-ready`

- Render function has produced a template tree.
- No host commit has occurred.

**Typical uses**:

- context tree construction
- structural analysis (slots, roles, providers)
- logic-only initialization

**Forbidden**:

- touching real view instances
- enabling events

---

### CP3 — `commit:done`

- `host.commit(children)` has completed.
- View nodes may physically exist.

**Not guaranteed**:

- stable instance reachability (framework refs may not be ready)

---

### CP4 — `instance:reachable`

- Rendered interaction instances are reachable and stable.
- This is the **event effectiveness gate**.

**Rules**:

- Events may not produce external effects before CP4.
- Adapters are encouraged to bind events at or after CP4.

---

### CP5 — `afterRenderCommit`

- Runtime calls `moduleHub.afterRenderCommit()`.
- Commit-related module synchronization may occur.

---

### CP6 — `protoPhase:mounted`

- Runtime enters mounted phase synchronously.
- Does not imply mounted callbacks have run.

---

### CP7 — `lifecycle:mounted-callbacks`

- Host-scheduled mounted callbacks execute.
- User-visible side effects are permitted.

---

## Update Cycle

For updates, adapters must preserve the relative order:

```
(sync props)
→ CP2
→ CP3
→ CP4
→ CP5
→ protoPhase:updated
→ lifecycle.updated callbacks
```

---

## Unmount Cycle (v0)

Unmounting is split into **three required checkpoints**.

### CP8 — `unmount:begin`

- Host indicates instance is being detached.
- Events must become ineffective immediately.

---

### CP9 — `lifecycle:unmounted-callbacks`

- `lifecycle.unmounted` callbacks execute.
- `run` and modules must remain usable.

---

### CP10 — `dispose:done`

- `moduleHub.dispose()` is executed.
- All caps are reset.
- No further access to runtime resources is permitted.

---

## Mandatory Adapter Rules

- CP4 is the global event effectiveness gate.
- `moduleHub` **must not** be disposed before CP9 completes.
- Checkpoints must be strictly ordered.
- Violations must be treated as implementation errors.

---

## Testing Requirements

Adapters and runtime must provide contract tests that verify:

- ordering invariance
- CP4 event gating
- unmounted usability vs post-disposal invalidation
- correct update sequencing

---

## Notes on Host Diversity

- Web Components may map CP4 ≈ CP3.
- Framework adapters may delay CP4 until refs are stable.
- Stronger guarantees are allowed; weaker guarantees are not.
