# internal/contracts/event/event.module.v0.md

> **Status**: Draft – implementation-ready
> **Version**: v0
>
> This document specifies the **Event module contract** in Proto UI:
> its responsibilities, guarantees, and constraints when participating in the
> event information flow.

---

## Layering Note (Normative)

This contract applies to the **event module implementation** only.

It does **not** define:

- the user-facing `def.event` API
- runtime callback signatures involving `run`
- adapter-specific event target resolution policies

The event module participates in the event information flow by:

- managing event registrations
- binding and unbinding host listeners
- reacting to capability changes and lifecycle transitions

---

## 0. Responsibilities and Non-responsibilities

### 0.1 Responsibilities (Normative)

An event module implementation MUST:

- accept setup-time event registrations
- produce stable registration identifiers (tokens)
- bind and unbind host listeners when instructed by the runtime
- route host events to a provided dispatch mechanism
- react to capability changes affecting binding targets
- clean up all registrations on unmount

### 0.2 Explicit Non-responsibilities (Normative)

An event module MUST NOT:

- store, create, or reason about runtime handles (`run`)
- invoke user callbacks directly
- perform callback matching based on function identity
- deduplicate registrations
- expose adapter-specific event targets through its facade

---

## 1. Module Interface Overview

This contract does not prescribe exact TypeScript signatures, but assumes
the following conceptual surfaces:

- **Facade** (setup-only):

  - registration APIs
  - token-based control
  - optional target redirection

- **Port** (runtime-only):

  - binding and unbinding of host listeners
  - optional diagnostics access

- **Lifecycle hooks**:

  - unmount cleanup
  - capability change reactions

---

## 2. Setup-time Registration Semantics

### 2.1 Registration creation

- Each setup-time registration call MUST create a new internal registration entry.
- No deduplication MUST occur, even if registrations are identical.

Each registration entry MUST record, at minimum:

- a unique stable identifier (`id`)
- the target kind (`root` or `global`)
- the event type
- listener options (if any)

### 2.2 Listener tokens

For each registration, the module MUST produce a token that:

- uniquely identifies the registration entry
- remains stable for the lifetime of the registration
- can be used for precise removal

The module MAY attach additional metadata to tokens
(e.g. dev-only diagnostic labels).

---

## 3. Binding and Dispatch

### 3.1 Binding invocation

The runtime will instruct the module to bind listeners at a safe point.

Rules (normative):

- If there are no registrations, binding MUST be a no-op.
- Binding MUST NOT read or require any event targets
  unless at least one corresponding registration exists.
- The module MUST resolve the appropriate binding target
  for each registration at bind time.

### 3.2 Dispatch indirection

When binding host listeners, the module MUST:

- associate each registration with a host listener
- ensure that host events are forwarded to a provided **dispatch function**
  using the registration’s identifier

Rules (normative):

- The dispatch function MUST be treated as an opaque callable.
- The module MUST NOT assume anything about dispatch semantics
  beyond accepting `(id, event)` or an equivalent pair.
- The module MUST NOT invoke user callbacks directly.

> _Rationale (informative):_
> This allows runtime-controlled association of runtime handles,
> phase enforcement, and scheduling semantics.

---

## 4. Unbinding and Removal

### 4.1 Explicit unbinding

When instructed to unbind:

- All currently bound host listeners MUST be detached.
- Registration entries MUST be preserved.
- Subsequent binding MUST reattach listeners using existing registrations.

### 4.2 Removal by token

When a registration is removed via its token:

- The corresponding registration entry MUST be deleted.
- If the registration is currently bound, its host listener
  MUST be detached immediately.
- Removal of an unknown identifier MUST be a no-op.

---

## 5. Capability Changes

Event modules MAY depend on adapter-provided capabilities
(e.g. root or global event targets).

Rules (normative):

- The module MUST observe capability changes that affect binding targets.
- If bindings are active and a relevant capability changes:

  - the module MUST detach existing host listeners
  - the module MUST rebind listeners using the updated targets

- Capability changes MUST NOT create or destroy registrations.

> _Informative:_
> A conservative “unbind-all then rebind-all” strategy is acceptable in v0.

---

## 6. Root Target Redirection

### 6.1 Setup-time override

The module MUST support overriding the root binding target during setup.

Rules (normative):

- Root target redirection MUST be setup-only.
- After setup completes, the redirection MUST become immutable.
- The overridden target MUST be used for all root-scoped registrations.
- Global registrations MUST remain unaffected.

### 6.2 Error handling

- Attempts to redirect the root target after setup MUST throw
  a phase-violation error.
- Invalid or non-target-like redirection values MUST throw
  an invalid-argument error.

---

## 7. Lifecycle Cleanup

On component unmount:

- All host listeners MUST be detached.
- All registration entries MUST be dropped.
- Any retained references to targets or dispatch functions
  MUST be released.

This cleanup MUST occur regardless of whether listeners
were manually removed earlier.

---

## 8. Diagnostics (Optional)

An event module MAY expose diagnostics for development or tooling purposes.

If provided:

- Diagnostics MUST reflect the current internal registration state.
- Diagnostics MUST NOT affect runtime behavior.
- Diagnostics APIs MAY be omitted entirely in production builds.

---

## 9. Error Model

An event module MUST throw errors for:

- setup-only API usage outside setup
- runtime-only API usage during setup
- invalid arguments (e.g. malformed token, invalid target override)
- required targets being unavailable at bind time

Errors SHOULD be distinguishable by type or error code.

---

## Appendix A: Relation to Executable Contracts (Informative)

This contract is enforced by executable module-level contract tests,
including (but not limited to):

- no-op binding without registrations
- target availability requirements
- dispatch routing by registration identifier
- immediate detachment on token removal
- rebinding on capability changes
- root target redirection semantics
- full cleanup on unmount
- setup/runtime phase enforcement

Refer to `packages/module-event/test/contract/` for executable specifications.
