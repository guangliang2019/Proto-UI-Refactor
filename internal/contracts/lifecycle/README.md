# internal/contracts/lifecycle/README.md

This directory defines the **Lifecycle Contracts** of Proto UI.

Lifecycle contracts specify **ordering guarantees**, **availability boundaries**, and **responsibility splits**
between:

- **Runtime** (execution engine)
- **Component Authors** (prototype authors)
- **Adapter Authors** (WC / React / Vue / etc.)

These documents are normative.
Implementations must follow them; deviations must be treated as bugs.

---

## Core Principles

### P0 — Single Canonical Timeline

Proto UI defines **one canonical lifecycle timeline**.

Host-specific lifecycles (DOM, framework, scheduler, refs, etc.) must be
**mapped into this timeline**, never parallel to it.

No adapter may introduce a second, competing lifecycle model.

---

### P1 — Order Invariance

Proto UI guarantees that:

> The **relative order** of lifecycle callbacks and internal checkpoints
> is invariant across hosts.

Different hosts may choose _when_ a checkpoint occurs,
but **may not reorder checkpoints**.

---

### P2 — Checkpoints, Not Phases

When high-level phases (e.g. `mounted`) are insufficiently precise,
Proto UI introduces **checkpoints** to pin down:

- availability boundaries
- side-effect safety
- module / context / event initialization order

Checkpoints refine the timeline without creating a new lifecycle system.

---

### P3 — Responsibility Split

- **Runtime** defines the canonical timeline and checkpoints.
- **Adapters** map host behavior into that timeline.
- **Component Authors** rely only on documented guarantees.

No layer may silently depend on undocumented timing.

---

## Documents

- `component-lifecycle.v0.md`
  Guarantees exposed to **Component Authors**.

- `adapter-lifecycle.v0.md`
  Obligations and constraints for **Adapter Authors** and runtime wiring.

---

## Versioning

- Current version: **v0**
- v0 guarantees ordering and availability.
- Future versions may add checkpoints but must not break existing guarantees.
