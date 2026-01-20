# internal/contracts/lifecycle/component-lifecycle.v0.md

This document defines the **lifecycle semantics guaranteed to Component Authors**.

It describes what prototype code may rely on when using
`def.lifecycle.*` callbacks and `run` handles.

> Scope: Prototype authors.
> Non-goals: adapter implementation details, scheduling primitives, DOM availability.

---

## Lifecycle Callbacks

### created

- Runs **once per instance**.
- Runs **after** `setup(def)` completes.
- Runs **before** the first host commit.

**Guaranteed**:

- `run` is available.
- props, context, and state APIs are usable (as provided by the host).
- subscriptions and side-effect intents may be registered.

**Not guaranteed**:

- Any rendered view nodes exist.
- Any events can fire.
- Any focus / measurement APIs are safe.

---

### mounted

- Runs **once per instance**, **after the first commit**.
- Scheduled by the host via `host.schedule`.
- Represents the point where the host considers the instance _connected_.

**Guaranteed**:

- The initial commit has completed.
- Event systems may become effective.
- Side effects that require a committed view are permitted.

**Not guaranteed**:

- Specific scheduling semantics (sync / microtask / macrotask / framework tick).
- That mounted runs immediately after commit.

Prototype code must not assume a specific scheduling primitive.

---

### update intent (`run.update()`)

- Expresses **intent to update**, not a synchronous commit request.

**Contract**:

- The host may batch, defer, or coalesce update intents.
- Calling `update()` does **not** guarantee immediate view changes.

---

### updated

- Runs **after a commit that corresponds to an update cycle**.
- May run fewer times than update intents if commits are coalesced.

**Guaranteed**:

- A host commit corresponding to an update has completed.

**Not guaranteed**:

- One-to-one mapping between update intents and updated callbacks.

---

### unmounted

- Runs when the host determines the instance is disconnected.
- Used to clean up side effects established during the instance lifetime.

**Guaranteed**:

- `run` is still available during `unmounted`.
- Modules, ports, and facades are still accessible.

**After unmounted returns**:

- The instance is considered fully disposed.
- No further access to `run`, modules, or caps is permitted.

---

## Ordering Guarantees

The following ordering is guaranteed:

1. `setup` → `created`
2. `created` → first `commit`
3. first `commit` → `mounted`
4. update `commit` → `updated`
5. `unmounted` runs **before** final disposal

---

## Side Effect Guidance (v0)

- Establish effects in `mounted` or `updated`.
- Dispose effects in `unmounted`.
- Effects must be written to tolerate delayed mounting and batched updates.

---

## What Component Authors Must Not Assume

- That DOM nodes exist during `created`.
- That events are active before `mounted`.
- That updates commit synchronously.
- That unmounted callbacks run after disposal (they do not).

These constraints are invariant across all hosts.
