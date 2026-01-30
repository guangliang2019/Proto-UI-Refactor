// packages/module-state/src/kernel.ts
import type { OwnedStateHandle } from "@proto-ui/core";
import type { StateEvent, StateSetReason } from "@proto-ui/types";

export type StateKind =
  | "bool"
  | "enum"
  | "string"
  | "numberRange"
  | "numberDiscrete";

export type StateId = number;

export type BoolSpec = { kind: "bool" };

export type EnumSpec<O extends readonly string[] = readonly string[]> = {
  kind: "enum";
  options: O;
};

export type StringSpec = {
  kind: "string";
  options?: readonly string[];
};

export type NumberRangeSpec = {
  kind: "numberRange";
  min: number;
  max: number;
  clamp?: boolean;
};

export type NumberDiscreteSpec = {
  kind: "numberDiscrete";
  options?: readonly number[];
  min?: number;
  max?: number;
  step?: number;
};

export type AnyStateSpec =
  | BoolSpec
  | EnumSpec
  | StringSpec
  | NumberRangeSpec
  | NumberDiscreteSpec;

type Subscriber<V> = (e: StateEvent<V>) => void;

type StateRecord<V> = {
  id: StateId;
  semantic: string;
  spec: AnyStateSpec;
  value: V;
  subscribers: Set<Subscriber<V>>;
};

export class StateKernel {
  private nextId: StateId = 1;
  private records = new Map<StateId, StateRecord<any>>();

  // event queue to make re-entrant set deterministic
  private emitting = false;
  private pending: Array<() => void> = [];

  /** Define a state and return an owned handle. */
  define<V>(semantic: string, spec: AnyStateSpec, defaultValue: V): OwnedStateHandle<V> {
    const id = this.nextId++;
    const rec: StateRecord<V> = {
      id,
      semantic,
      spec,
      value: defaultValue,
      subscribers: new Set(),
    };
    this.records.set(id, rec);

    const h: OwnedStateHandle<V> = {
      get: () => this.getById<V>(id),
      setDefault: (v) => {
        // setup-only is enforced by runtime; kernel stays pure
        this.setDefaultById<V>(id, v);
      },
      set: (v, reason) => {
        // runtime-only is enforced by runtime; kernel stays pure
        this.setById<V>(id, v, reason);
      },
    };

    // attach metadata for internal ops/debug (non-typed)
    (h as any).__stateId = id;
    (h as any).__stateSemantic = semantic;
    (h as any).__stateKind = spec.kind;

    return h;
  }

  /** Internal: subscribe to state changes (v0: for tests & future modules). */
  subscribe<V>(handle: OwnedStateHandle<V>, cb: Subscriber<V>): () => void {
    const id = this.getIdFromHandle(handle);
    const rec = this.getRecord<V>(id);
    rec.subscribers.add(cb);
    return () => rec.subscribers.delete(cb);
  }

  /** Internal: get semantic from a handle. */
  getSemantic(handle: OwnedStateHandle<any>): string {
    const id = this.getIdFromHandle(handle);
    return this.getRecord<any>(id).semantic;
  }

  /** Internal: get kind from a handle. */
  getKind(handle: OwnedStateHandle<any>): StateKind {
    const id = this.getIdFromHandle(handle);
    return this.getRecord<any>(id).spec.kind as StateKind;
  }

  // ---- byId helpers ----

  private getById<V>(id: StateId): V {
    return this.getRecord<V>(id).value;
  }

  private setDefaultById<V>(id: StateId, v: V): void {
    // setDefault never emits in v0 (setup semantics)
    const rec = this.getRecord<V>(id);
    rec.value = v;
  }

  private setById<V>(id: StateId, next: V, reason?: StateSetReason): void {
    const rec = this.getRecord<V>(id);
    const prev = rec.value;
    if (Object.is(prev, next)) return;

    rec.value = next;

    const emit = () => {
      // StateEvent shape comes from @proto-ui/types; we fill common fields.
      // If your StateEvent requires different fields, adjust here.
      const e = {
        prev,
        next,
        reason,
        semantic: rec.semantic,
      } as unknown as StateEvent<V>;

      for (const cb of rec.subscribers) cb(e);
    };

    if (this.emitting) {
      this.pending.push(emit);
      return;
    }

    this.emitting = true;
    try {
      emit();
      // flush any queued emits caused by re-entrant sets
      while (this.pending.length) {
        const task = this.pending.shift()!;
        task();
      }
    } finally {
      this.emitting = false;
    }
  }

  private getIdFromHandle(handle: OwnedStateHandle<any>): StateId {
    const id = (handle as any).__stateId as StateId | undefined;
    if (!id) {
      throw new Error(`[StateKernel] expects handle created by this kernel`);
    }
    return id;
  }

  private getRecord<V>(id: StateId): StateRecord<V> {
    const rec = this.records.get(id);
    if (!rec) throw new Error(`[StateKernel] unknown state id: ${id}`);
    return rec as StateRecord<V>;
  }

  /** cleanup all internal state */
  dispose(): void {
    this.records.clear();
    this.pending = [];
    this.emitting = false;
  }
}
