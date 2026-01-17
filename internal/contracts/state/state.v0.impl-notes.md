# state.v0.impl-notes.md (Implementation Notes)

> Informal notes for implementers. Not normative; the contract is `state.v0.md`.

---

## 1) Mental model

Think of state as a **validated slot** with:

- a stable `StateId` (internal)
- a required `semantic` dotted label (for humans + collisions + downstream modules)
- a **capability-shaped handle** depending on visibility/access path

State is not “reactivity”; it’s “state machine slots that other systems can observe”.

---

## 2) Suggested internal data structures

### State record

Maintain a registry on each component instance:

- `StateRecord<V>`:

  - `id: StateId`
  - `semantic: string`
  - `spec: StateSpec`
  - `value: V`
  - `provider: { kind: 'prototype'|'hook', name?: string, chain?: string[] }`
  - `visibility: 'private'|'protected'|'public'` (public is derived via expose)
  - `watchers: Set<PrototypeWatcher<V>>` (prototype-side)
  - `subscribers: Set<AppSubscriber<V>>` (app-side)
  - `isNotifying: boolean`
  - `queue: Array<StateNextEvent<V>>` (per record or shared queue)

### Watcher vs Subscriber

Keep them separate because:

- watcher callback is `(run, event)` and auto-cleans on unmount
- subscriber callback is `(event)` and external-owned, but auto-unsubscribes on disconnect

---

## 3) Phase guard integration

You already have `GuardInfo { prototypeName, phase }`.

- `watch(...)` and `setDefault(...)` should check: `phase === 'setup'`
- `set(...)` should check: `phase === 'callback'` (your current “runtime-only callback” phase)

This matches your convention: runtime-only callback first arg is `run`.

---

## 4) Hook promotion (dynamic context)

Promotion should not depend on code structure. Use an execution-context flag:

- During hook installation via official APIs, runtime sets `ctx.isHookInstall = true` for that setup execution.
- Any `def.state.*` executed while `ctx.isHookInstall === true` produces **protected** states for the hook caller.

Helper functions called within hook setup still see the same flag (dynamic context), so they’re included automatically.

---

## 5) Semantic collision enforcement

When defining a state:

- validate semantic format (segments kebab-case, '.' separated)
- check registry: if any existing record has the same semantic, throw `STATE_SEMANTIC_COLLISION`
- include provider origin + chain in error payload/message

Do not auto-prefix hook semantics; collision resolution belongs to Component Author.

---

## 6) set / get / notification pipeline

### Change detection

- If `Object.is(prev, next)` is true: do nothing (no event, no mapping).

### On successful change

Construct a `StateNextEvent`:

- `{ type:'next', prev, next, reason }`

Then:

1. apply expose mapping synchronously (if mapped; call expose module hook)
2. enqueue notifications
3. drain notifications with re-entrancy protection

### Re-entrancy protection (queueing)

A simple, robust pattern:

- If currently delivering notifications (`isNotifying` true):

  - push into `queue`
  - return

- Else:

  - set `isNotifying = true`
  - deliver current event
  - while queue not empty: pop FIFO and deliver
  - finally set `isNotifying = false`

This prevents synchronous nested delivery while still allowing cb to call `set()` legitimately.

---

## 7) Event delivery

### Prototype-side watchers

- Each watcher is registered during setup, but invoked during callback-time.
- Signature: `(run, event)`
- Implementation needs access to the component’s `run` handle when delivering.

### App-side subscribers

- Signature: `(event)`
- No run handle.
- No dedup: each subscribe call registers one record and returns an idempotent unsubscriber.

---

## 8) Disconnect / unmount teardown

On component instance unmount:

1. Remove all prototype watchers (they’re instance-scoped anyway).
2. For each app subscriber:

   - deliver `{ type:'disconnect', reason:'unmount' }`
   - remove subscriber

3. Ensure no retained references to callbacks remain.

No subscription inheritance across remount. New instance => new handles/subscriptions.

---

## 9) What state does NOT define

- Mapping keys, serialization formats, and host representation: these belong to `expose`.
- How host reacts to changes: host decides (no update scheduling from state core).

State does, however, guarantee that expose mapping hooks are invoked synchronously within `set()`.

---

## 10) Error typing

Even if you don’t have a unified Error base class yet, contract tests want stable typing:

Recommended approach:

- create lightweight error helpers that set `error.code`
- throw with codes:

  - STATE_PHASE_VIOLATION
  - STATE_SPEC_VIOLATION
  - STATE_SEMANTIC_COLLISION
  - STATE_CAPABILITY_VIOLATION
