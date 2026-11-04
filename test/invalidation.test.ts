import { afterEach, describe, expect, it, vi } from "vitest";
import { batch, computed, derived, type Owned, type Readable, type ReadableOptions, watch, writable } from "../src";

type Create = (
  sources: readonly Readable<number>[],
  compute: (...values: number[]) => number,
  options?: ReadableOptions<number>,
) => Owned<Readable<number>>;

const factories: { name: string; create: Create }[] = [
  {
    name: "computed",
    create: (sources, compute, options) => computed(() => compute(...sources.map((source) => source.get())), options),
  },
  {
    name: "derived",
    create: (sources, compute, options) => derived(sources, compute, options),
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(factories)("$name invalidation", ({ create }) => {
  it("does not recompute an observed input reverted in 100 consecutive batches", () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value * 2);
    const value = create([source], compute);
    const subscriber = vi.fn();
    const stop = value.subscribe(subscriber, { sync: true });

    for (let index = 0; index < 100; index++) {
      batch(() => {
        source.set(1);
        source.set(0);
      });
    }
    expect(value.get()).toBe(0);
    expect(compute).toHaveBeenCalledOnce();
    expect(subscriber.mock.calls).toEqual([[0]]);

    source.set(2);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(subscriber.mock.calls).toEqual([[0], [4]]);
    stop();
    value.dispose();
  });

  it("keeps an unobserved cached result after repeated reverted batches", () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value * 2);
    const value = create([source], compute);
    expect(value.get()).toBe(0);

    for (let index = 0; index < 100; index++) {
      batch(() => {
        source.set(1);
        source.set(0);
      });
      expect(value.get()).toBe(0);
    }
    expect(compute).toHaveBeenCalledOnce();
    value.dispose();
  });

  it("skips reverted asynchronous work and handles the next change", async () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value * 2);
    const value = create([source], compute);
    const subscriber = vi.fn();
    const stop = value.subscribe(subscriber);

    source.set(1);
    source.set(0);
    await Promise.resolve();
    expect(compute).toHaveBeenCalledOnce();
    expect(subscriber.mock.calls).toEqual([[0]]);

    source.set(2);
    await Promise.resolve();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(subscriber.mock.calls).toEqual([[0], [4]]);
    stop();
    value.dispose();
  });

  it("still initializes an unread result after its input reverts", () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value * 2);
    const value = create([source], compute);

    batch(() => {
      source.set(1);
      source.set(0);
    });
    expect(compute).not.toHaveBeenCalled();
    expect(value.get()).toBe(0);
    expect(compute).toHaveBeenCalledOnce();
    value.dispose();
  });

  it("skips reverted inputs in nested batches", () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value * 2);
    const value = create([source], compute);
    const stop = value.subscribe(() => {}, { sync: true });

    batch(() => {
      source.set(1);
      batch(() => source.set(0));
    });
    expect(compute).toHaveBeenCalledOnce();
    stop();
    value.dispose();
  });

  it("recomputes repeated input values when source equality is disabled", () => {
    const source = writable(0, { equal: false });
    const compute = vi.fn((value: number) => value * 2);
    const value = create([source], compute);
    const subscriber = vi.fn();
    const stop = value.subscribe(subscriber, { sync: true });

    batch(() => {
      source.set(0);
      source.set(0);
    });
    expect(compute).toHaveBeenCalledTimes(2);
    expect(subscriber.mock.calls).toEqual([[0]]);
    stop();
    value.dispose();
  });

  it("does not force evaluation merely because output equality is disabled", () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value % 2);
    const value = create([source], compute, { equal: false });
    const subscriber = vi.fn();
    const stop = value.subscribe(subscriber, { sync: true });

    batch(() => {
      source.set(1);
      source.set(0);
    });
    expect(compute).toHaveBeenCalledOnce();
    expect(subscriber.mock.calls).toEqual([[0]]);

    source.set(2);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(subscriber.mock.calls).toEqual([[0], [0]]);
    stop();
    value.dispose();
  });

  it("uses custom input equality to retain the cached result", () => {
    const source = writable(0, { equal: (a, b) => a % 10 === b % 10 });
    const compute = vi.fn((value: number) => value * 2);
    const value = create([source], compute);
    const subscriber = vi.fn();
    const stop = value.subscribe(subscriber, { sync: true });

    batch(() => {
      source.set(1);
      source.set(10);
    });
    expect(source.get()).toBe(10);
    expect(value.get()).toBe(0);
    expect(compute).toHaveBeenCalledOnce();
    expect(subscriber.mock.calls).toEqual([[0]]);

    source.set(11);
    expect(value.get()).toBe(22);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(subscriber.mock.calls).toEqual([[0], [22]]);
    stop();
    value.dispose();
  });

  it("recomputes when another input changes while the first input reverts", () => {
    const first = writable(0);
    const second = writable(0);
    const compute = vi.fn((a: number, b: number) => a + b);
    const value = create([first, second], compute);
    const subscriber = vi.fn();
    const stop = value.subscribe(subscriber, { sync: true });

    batch(() => {
      first.set(1);
      first.set(0);
      second.set(2);
    });
    expect(value.get()).toBe(2);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(subscriber.mock.calls).toEqual([[0], [2]]);
    stop();
    value.dispose();
  });

  it("skips all computations in a reverted chain", () => {
    const source = writable(0);
    const firstCompute = vi.fn((value: number) => value + 1);
    const first = create([source], firstCompute);
    const lastCompute = vi.fn((value: number) => value * 2);
    const last = create([first], lastCompute);
    const subscriber = vi.fn();
    const stop = last.subscribe(subscriber, { sync: true });

    batch(() => {
      source.set(1);
      source.set(0);
    });
    expect(firstCompute).toHaveBeenCalledOnce();
    expect(lastCompute).toHaveBeenCalledOnce();
    expect(subscriber.mock.calls).toEqual([[2]]);

    source.set(1);
    expect(firstCompute).toHaveBeenCalledTimes(2);
    expect(lastCompute).toHaveBeenCalledTimes(2);
    expect(subscriber.mock.calls).toEqual([[2], [4]]);
    stop();
    last.dispose();
    first.dispose();
  });

  it("skips a reverted diamond and keeps later updates glitch-free", () => {
    const source = writable(0);
    const leftCompute = vi.fn((value: number) => value + 1);
    const rightCompute = vi.fn((value: number) => value + 2);
    const joinCompute = vi.fn((left: number, right: number) => left + right);
    const left = create([source], leftCompute);
    const right = create([source], rightCompute);
    const join = create([left, right], joinCompute);
    const subscriber = vi.fn();
    const stop = join.subscribe(subscriber, { sync: true });

    batch(() => {
      source.set(1);
      source.set(0);
    });
    expect(leftCompute).toHaveBeenCalledOnce();
    expect(rightCompute).toHaveBeenCalledOnce();
    expect(joinCompute).toHaveBeenCalledOnce();
    expect(subscriber.mock.calls).toEqual([[3]]);

    source.set(1);
    expect(leftCompute).toHaveBeenCalledTimes(2);
    expect(rightCompute).toHaveBeenCalledTimes(2);
    expect(joinCompute).toHaveBeenCalledTimes(2);
    expect(subscriber.mock.calls).toEqual([[3], [5]]);
    stop();
    join.dispose();
    right.dispose();
    left.dispose();
  });

  it("returns intermediate batch reads without an extra computation at batch end", () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value * 2);
    const value = create([source], compute);
    const subscriber = vi.fn();
    const stop = value.subscribe(subscriber, { sync: true });

    batch(() => {
      source.set(1);
      expect(value.get()).toBe(2);
      source.set(0);
      expect(value.get()).toBe(0);
    });
    expect(value.get()).toBe(0);
    expect(compute).toHaveBeenCalledTimes(3);
    expect(subscriber.mock.calls).toEqual([[0]]);
    stop();
    value.dispose();
  });

  it("handles a subscriber writing the same input again", () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value * 2);
    const value = create([source], compute);
    const subscriber = vi.fn();
    const stop = value.subscribe(
      (next) => {
        subscriber(next);
        if (next === 2) source.set(2);
      },
      { sync: true },
    );

    source.set(1);
    expect(value.get()).toBe(4);
    expect(compute).toHaveBeenCalledTimes(3);
    expect(subscriber.mock.calls).toEqual([[0], [2], [4]]);
    stop();
    value.dispose();
  });

  it("reads the final frozen value after an unobserved input is disposed", () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value * 2);
    const value = create([source], compute);
    expect(value.get()).toBe(0);

    source.set(1);
    source.dispose();
    expect(value.get()).toBe(2);
    expect(compute).toHaveBeenCalledTimes(2);
    value.dispose();
  });

  it("resolves a live result when its input is disposed inside a batch", () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value * 2);
    const value = create([source], compute);
    const subscriber = vi.fn();
    const stop = value.subscribe(subscriber, { sync: true });

    batch(() => {
      source.set(1);
      source.dispose();
    });
    expect(value.get()).toBe(2);
    expect(subscriber.mock.calls).toEqual([[0], [2]]);
    stop();
    value.dispose();
  });

  it("reads a computed input's final published value after disposal", () => {
    const source = writable(0);
    const first = create([source], (value) => value);
    const compute = vi.fn((value: number) => value * 2);
    const value = create([first], compute);
    expect(value.get()).toBe(0);

    source.set(1);
    expect(first.get()).toBe(1);
    first.dispose();
    expect(value.get()).toBe(2);
    expect(compute).toHaveBeenCalledTimes(2);
    value.dispose();
  });

  it("retries a failed result without requiring another input write", () => {
    const source = writable(0);
    const error = new Error("compute");
    let fail = false;
    const compute = vi.fn((value: number) => {
      if (fail) throw error;
      return value * 2;
    });
    const value = create([source], compute);
    expect(value.get()).toBe(0);

    fail = true;
    source.set(1);
    expect(() => value.get()).toThrow(error);
    fail = false;
    expect(value.get()).toBe(2);
    expect(compute).toHaveBeenCalledTimes(3);
    value.dispose();
  });

  it("wakes downstream observers after input equality throws", () => {
    const error = new Error("input equality");
    let fail = false;
    const source = writable(0, {
      equal: (a, b) => {
        if (fail && a === 0 && b === 2) throw error;
        return a === b;
      },
    });
    const compute = vi.fn((value: number) => value * 2);
    const value = create([source], compute);
    const subscriber = vi.fn();
    const stop = value.subscribe(subscriber, { sync: true });

    fail = true;
    expect(() =>
      batch(() => {
        source.set(1);
        source.set(2);
      }),
    ).toThrow(error);
    expect(compute).toHaveBeenCalledOnce();
    expect(subscriber.mock.calls).toEqual([[0]]);

    fail = false;
    source.set(3);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(subscriber.mock.calls).toEqual([[0], [6]]);
    stop();
    value.dispose();
  });

  it("retains its retry requirement when the input reverts after a failure", () => {
    const source = writable(0);
    const error = new Error("compute");
    let fail = false;
    const compute = vi.fn((value: number) => {
      if (fail) throw error;
      return value * 2;
    });
    const value = create([source], compute);
    expect(value.get()).toBe(0);

    fail = true;
    source.set(1);
    expect(() => value.get()).toThrow(error);
    source.set(0);
    fail = false;
    expect(value.get()).toBe(0);
    expect(compute).toHaveBeenCalledTimes(3);
    value.dispose();
  });

  it("still rejects a circular computation", () => {
    let value: Owned<Readable<number>>;
    value = create([], () => value.get());
    expect(() => value.get()).toThrow("loop detected");
    value.dispose();
  });
});

it.each(["subscribe", "watch"])("%s ignores queued work from a disposed source", (kind) => {
  const source = writable(0);
  const subscriber = vi.fn();
  const stop =
    kind === "subscribe"
      ? source.subscribe(subscriber, { sync: true })
      : watch(() => subscriber(source.get()), { sync: true });

  batch(() => {
    source.set(1);
    source.dispose();
  });
  expect(subscriber.mock.calls).toEqual([[0]]);
  stop();
});

it("retains dynamic dependencies when a branch selection reverts", () => {
  const selectFirst = writable(true);
  const first = writable(1);
  const second = writable(10);
  const compute = vi.fn(() => (selectFirst.get() ? first.get() : second.get()));
  const value = computed(compute);
  const subscriber = vi.fn();
  const stop = value.subscribe(subscriber, { sync: true });

  batch(() => {
    selectFirst.set(false);
    second.set(20);
    selectFirst.set(true);
  });
  expect(value.get()).toBe(1);
  expect(compute).toHaveBeenCalledOnce();
  expect(subscriber.mock.calls).toEqual([[1]]);

  first.set(2);
  expect(compute).toHaveBeenCalledTimes(2);
  selectFirst.set(false);
  expect(value.get()).toBe(20);
  expect(compute).toHaveBeenCalledTimes(3);
  first.set(3);
  expect(compute).toHaveBeenCalledTimes(3);
  expect(subscriber.mock.calls).toEqual([[1], [2], [20]]);
  stop();
  value.dispose();
});
