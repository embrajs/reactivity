import { describe, expect, it } from "vitest";
import { computed, derived, type Owned, type Readable, watch, writable } from "../src";

describe("deep dependency disconnection", () => {
  it.each([false, true])("disconnects a previously evaluated chain without recursive teardown, static=%s", (fixed) => {
    const source = writable(0);
    const nodes: Owned<Readable<number>>[] = [];
    let current: Owned<Readable<number>> = source;
    for (let i = 0; i < 6000; i++) {
      const parent = current;
      current = fixed ? derived(parent, (value) => value + 1) : computed(() => parent.get() + 1);
      expect(current.get()).toBe(i + 1);
      nodes.push(current);
    }
    let value = 0;
    const stop = watch(
      () => {
        value = current.get();
      },
      { sync: true },
    );
    expect(value).toBe(6000);
    expect(stop).not.toThrow();
    expect(() => source.set(1)).not.toThrow();
    const values: number[] = [];
    const fresh = watch(
      () => {
        values.push(source.get());
      },
      { sync: true },
    );
    source.set(2);
    expect(values).toEqual([1, 2]);
    fresh();
    for (const node of nodes) {
      node.dispose();
    }
    source.dispose();
  });
});
