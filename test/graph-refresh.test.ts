import { expect, it } from "vitest";
import { batch, computed, derived, type Owned, type Readable, watch, writable } from "../src";

it("refreshes a mixed DAG against an independent evaluator across batched branch changes", async () => {
  const raw = [0, 1, 2, 3];
  let selected = false;
  const roots = raw.map((value) => writable(value));
  const branch = writable(selected);
  const nodes: Owned<Readable<number>>[] = [];
  const expected = () => {
    const values = [...raw];
    for (let i = 0; i < 24; i++) {
      const a = (i * 3 + 1) % values.length;
      const b = (i * 5 + 2) % values.length;
      values.push(
        i % 3 === 0
          ? (values[a] + values[b] * 2 + i) % 17
          : ((selected ? values[a] * 3 + values[b] : values[b] * 2 - values[a]) + i) % 17,
      );
    }
    return values;
  };
  for (let i = 0; i < 24; i++) {
    const inputs = [...roots, ...nodes];
    const a = inputs[(i * 3 + 1) % inputs.length];
    const b = inputs[(i * 5 + 2) % inputs.length];
    nodes.push(
      i % 3 === 0
        ? derived([a, b], (x, y) => (x + y * 2 + i) % 17)
        : computed(() => ((branch.get() ? a.get() * 3 + b.get() : b.get() * 2 - a.get()) + i) % 17),
    );
  }
  const indices = [5, 11, 17, 23];
  const sync: number[] = [],
    async: number[] = [];
  const stops = indices.flatMap((index, slot) => [
    watch(
      () => {
        sync[slot] = nodes[index].get();
      },
      { sync: true },
    ),
    nodes[index].subscribe((value) => {
      async[slot] = value;
    }),
  ]);
  let seed = 7;
  try {
    for (let step = 0; step < 120; step++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const first = (seed >>> 4) % roots.length;
      const second = (seed >>> 8) % roots.length;
      batch(() => {
        raw[first] = (seed >>> 12) & 31;
        roots[first].set(raw[first]);
        if (seed & 1) {
          selected = !selected;
          branch.set(selected);
        }
        const index = (seed >>> 20) % nodes.length;
        expect(nodes[index].get()).toBe(expected()[index + roots.length]);
        raw[second] = (seed >>> 17) & 31;
        roots[second].set(raw[second]);
        if (seed & 2) {
          selected = !selected;
          branch.set(selected);
        }
      });
      const values = expected();
      expect(sync).toEqual(indices.map((index) => values[index + roots.length]));
      await Promise.resolve();
      expect(async).toEqual(indices.map((index) => values[index + roots.length]));
    }
  } finally {
    for (const stop of stops) {
      stop();
    }
    for (const node of nodes.reverse()) {
      node.dispose();
    }
    for (const root of roots) {
      root.dispose();
    }
    branch.dispose();
  }
});

it.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])("keeps a queued computed lazy after its last watch leaves, sync=%s fixed=%s", async (sync, fixed) => {
  const input = writable(0);
  let calls = 0;
  const compute = (value: number) => {
    calls++;
    return value * 2;
  };
  const output = fixed ? derived(input, compute) : computed(() => compute(input.get()));
  const stop = watch(
    () => {
      output.get();
    },
    { sync },
  );
  try {
    batch(() => {
      input.set(1);
      stop();
    });
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(output.get()).toBe(2);
    expect(calls).toBe(2);
  } finally {
    stop();
    output.dispose();
    input.dispose();
  }
});

it("consumes refreshed inputs once when a dirty parent reads a dirty child", () => {
  const input = writable(0);
  let childCalls = 0;
  let parentCalls = 0;
  const child = computed(() => {
    childCalls++;
    return input.get() * 2;
  });
  const parent = computed(() => {
    parentCalls++;
    return input.get() + child.get();
  });
  try {
    expect(parent.get()).toBe(0);
    expect(parent.get()).toBe(0);
    input.set(1);
    expect(parent.get()).toBe(3);
    expect(parent.get()).toBe(3);
    expect(childCalls).toBe(2);
    expect(parentCalls).toBe(2);
  } finally {
    parent.dispose();
    child.dispose();
    input.dispose();
  }
});
