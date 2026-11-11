import { describe, expect, it, vi } from "vitest";
import { batch, computed, derived, type Owned, type Readable, watch, writable } from "../src";

const factories = [
  {
    name: "computed",
    create: (source: Readable<number>, fn: (value: number) => number) => computed(() => fn(source.get())),
  },
  { name: "derived", create: (source: Readable<number>, fn: (value: number) => number) => derived(source, fn) },
];

describe.each(factories)("$name publication", ({ create }) => {
  it("keeps downstream confirmation after an upstream is read separately", () => {
    const source = writable(0);
    const first = create(source, (value) => value % 2);
    const compute = vi.fn((value: number) => value + 1);
    const second = create(first, compute);
    expect(second.get()).toBe(1);

    source.set(1);
    expect(first.get()).toBe(1);
    expect(second.get()).toBe(2);
    expect(compute).toHaveBeenCalledTimes(2);

    source.set(3);
    expect(first.get()).toBe(1);
    expect(second.get()).toBe(2);
    expect(compute).toHaveBeenCalledTimes(2);
    second.dispose();
    first.dispose();
  });

  it("stops unchanged publications before a heavy downstream computation", () => {
    const source = writable(0);
    const first = create(source, (value) => value % 2);
    const compute = vi.fn((value: number) => value * 100);
    const second = create(first, compute);
    const callback = vi.fn();
    const cleanup = vi.fn();
    const stop = watch(
      () => {
        callback(second.get());
        return cleanup;
      },
      { sync: true },
    );

    batch(() => {
      source.set(1);
      source.set(0);
    });
    source.set(2);
    expect(second.get()).toBe(0);
    expect(compute).toHaveBeenCalledOnce();
    expect(callback.mock.calls).toEqual([[0]]);
    expect(cleanup).not.toHaveBeenCalled();
    source.set(3);
    expect(callback.mock.calls).toEqual([[0], [100]]);
    stop();
    second.dispose();
    first.dispose();
  });

  it("filters reverted asynchronous inputs and observes the next change", async () => {
    const source = writable(0);
    const input = create(source, (value) => value * 2);
    const callback = vi.fn();
    const stop = input.subscribe(callback);
    source.set(1);
    source.set(0);
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[0]]);
    source.set(2);
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[0], [4]]);
    stop();
    input.dispose();
  });

  it("uses the frozen value of an input disposed with pending work", () => {
    const source = writable(0);
    const input = create(source, (value) => value * 2);
    const callback = vi.fn();
    const stop = input.subscribe(callback, { sync: true });
    batch(() => {
      source.set(2);
      source.dispose();
    });
    expect(input.get()).toBe(4);
    expect(callback.mock.calls).toEqual([[0], [4]]);
    stop();
    input.dispose();
  });
});

it.each([false, true])("ordinary reads do not change Effect consumption, sync=%s", async (sync) => {
  const source = writable(0);
  const callback = vi.fn();
  const cleanup = vi.fn();
  const stop = watch(
    () => {
      callback(source.get());
      return cleanup;
    },
    { sync },
  );
  batch(() => {
    source.set(1);
    expect(source.get()).toBe(1);
    source.set(0);
  });
  await Promise.resolve();
  expect(callback.mock.calls).toEqual([[0]]);
  expect(cleanup).not.toHaveBeenCalled();
  stop();
});

it("compares a synchronous subscription group with its consumed value after intermediate memo reads", () => {
  const source = writable(0);
  const input = computed(() => source.get() * 2);
  const callback = vi.fn();
  const stop = input.subscribe(callback, { sync: true });
  batch(() => {
    source.set(1);
    expect(input.get()).toBe(2);
    source.set(0);
    expect(input.get()).toBe(0);
  });
  expect(callback.mock.calls).toEqual([[0]]);
  stop();
  input.dispose();
});

it.each([false, true])("only tests equality-disabled inputs after their own publication, sync=%s", async (sync) => {
  const forced = writable(0, { equal: false });
  const source = writable(0);
  const stable = computed(() => source.get() % 2);
  const callback = vi.fn();
  const stop = watch(
    () => {
      callback(forced.get(), stable.get());
    },
    { sync },
  );
  source.set(2);
  await Promise.resolve();
  expect(callback.mock.calls).toEqual([[0, 0]]);
  forced.set(0);
  await Promise.resolve();
  expect(callback.mock.calls).toEqual([
    [0, 0],
    [0, 0],
  ]);
  stop();
  stable.dispose();
});

describe.each([false, true])("independent DAG evaluation, static=%s", (fixed) => {
  it.each([false, true])("matches a fresh evaluator across batches and intermediate reads, sync=%s", async (sync) => {
    let seed = 7;
    const random = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % limit;
    };
    const raw = [0, 1, 2, 3];
    const sources = raw.map((value) => writable(value));
    const nodes: Readable<number>[] = [...sources];
    const owned: Owned<Readable<number>>[] = [];
    const reference: (() => number)[] = raw.map((_, index) => () => raw[index]);
    for (let index = 4; index < 48; index++) {
      const left = random(index);
      const right = random(index);
      const selector = random(4);
      const calculate = (value: number) => (value + index) % 11;
      const node = fixed
        ? derived([nodes[left], nodes[right], sources[selector]], (a, b, gate) => calculate(gate & 1 ? a : b))
        : computed(() => calculate(sources[selector].get() & 1 ? nodes[left].get() : nodes[right].get()));
      reference.push(() => calculate(raw[selector] & 1 ? reference[left]() : reference[right]()));
      nodes.push(node);
      owned.push(node);
    }
    let observed = 0;
    const stop = watch(
      () => {
        observed = nodes[47].get();
      },
      { sync },
    );
    for (let iteration = 0; iteration < 150; iteration++) {
      batch(() => {
        for (let count = random(4) + 1; count; count--) {
          const source = random(4);
          sources[source].set((raw[source] = random(9) - 4));
          if (random(3) === 0) {
            const index = random(nodes.length);
            expect(nodes[index].get()).toBe(reference[index]());
          }
        }
      });
      await Promise.resolve();
      expect(observed).toBe(reference[47]());
      for (let index = 0; index < nodes.length; index++) {
        expect(nodes[index].get()).toBe(reference[index]());
      }
    }
    stop();
    for (const node of owned) {
      node.dispose();
    }
  });
});

it.each(["test", "production"])("isolates equality reads during Effect writes in %s", (environment) => {
  vi.stubEnv("NODE_ENV", environment);
  try {
    const control = writable(0);
    const hidden = writable(0);
    const input = writable(0, {
      equal: (a, b) => {
        hidden.get();
        return a === b;
      },
    });
    const output = derived(input, (value) => value * 2, { equal: (a, b) => a === b });
    const callback = vi.fn();
    const cleanup = vi.fn();
    const writer = vi.fn();
    const stopReader = watch(
      () => {
        callback(output.get());
        return cleanup;
      },
      { sync: true },
    );
    const stopWriter = watch(
      () => {
        writer();
        input.set(control.get());
      },
      { sync: true },
    );
    hidden.set(1);
    expect(writer).toHaveBeenCalledOnce();
    expect(callback.mock.calls).toEqual([[0]]);
    control.set(2);
    expect(writer).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls).toEqual([[0], [4]]);
    expect(cleanup).toHaveBeenCalledOnce();
    stopWriter();
    stopReader();
    output.dispose();
    expect(cleanup).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllEnvs();
  }
});
