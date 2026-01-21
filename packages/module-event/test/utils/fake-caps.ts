// packages/module-event/test/utils/fake-caps.ts
export function makeCaps(getters: Record<string, any>) {
    let epoch = 0;
    const subs = new Set<(epoch: number) => void>();
  
    return {
      get(k: string) {
        return getters[k];
      },
      onChange(cb: (epoch: number) => void) {
        subs.add(cb);
        return () => subs.delete(cb);
      },
      // test-only helper:
      __bump() {
        epoch++;
        for (const cb of subs) cb(epoch);
      },
    } as any;
  }
  