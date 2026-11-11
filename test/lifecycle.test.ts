import { describe, expect, it, vi } from "vitest";
import { batch, computed, derived, type Readable, watch, writable } from "../src";

async function collect(): Promise<void> {
  // WeakRef targets remain alive until the end of the job that last dereferenced them.
  await new Promise<void>((resolve) => setImmediate(resolve));
  globalThis.gc!();
}

describe.each([
  {
    name: "computed",
    create: (source: Readable<number>, compute: (value: number) => number) => computed(() => compute(source.get())),
  },
  {
    name: "derived",
    create: (source: Readable<number>, compute: (value: number) => number) => derived(source, compute),
  },
])("$name lifecycle", ({ create }) => {
  it("can be collected before its first read", async () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value + 1);
    const ref = (() => {
      const value = create(source, compute);
      return new WeakRef(value);
    })();

    await collect();
    expect(ref.deref()).toBeUndefined();
    source.set(1);
    expect(compute).not.toHaveBeenCalled();
  });

  it("reads an input disposed before its first evaluation", () => {
    const source = writable(0);
    const value = create(source, (input) => input + 1);
    source.set(1);
    source.dispose();
    expect(value.get()).toBe(2);
    value.dispose();
  });

  it("keeps an evaluated observer connected until it is disposed", async () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value + 1);
    const ref = (() => {
      const value = create(source, compute);
      expect(value.get()).toBe(1);
      return new WeakRef(value);
    })();

    await collect();
    expect(ref.deref()).toBeDefined();
    source.set(1);
    expect(compute).toHaveBeenCalledOnce();
    expect(ref.deref()!.get()).toBe(2);
    ref.deref()!.dispose();
    await collect();
    expect(ref.deref()).toBeUndefined();
    source.set(2);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("keeps an active node alive until its subscriber disposes itself", async () => {
    const source = writable(0);
    const seen: number[] = [];
    const ref = (() => {
      const value = create(source, (input) => input);
      value.subscribe(
        function (input) {
          seen.push(input);
          if (input === 2) this.dispose();
        },
        { sync: true },
      );
      return new WeakRef(value);
    })();

    await collect();
    expect(ref.deref()).toBeDefined();
    source.set(1);
    source.set(2);
    expect(seen).toEqual([0, 1, 2]);
    await collect();
    expect(ref.deref()).toBeUndefined();
    source.set(3);
    expect(seen).toEqual([0, 1, 2]);
  });

  it("releases a whole chain when the last subscription is cancelled", async () => {
    const source = writable(0);
    const { first, second, stop } = (() => {
      const first = create(source, (value) => value + 1);
      const second = create(first, (value) => value + 1);
      return { first: new WeakRef(first), second: new WeakRef(second), stop: second.subscribe(() => {}) };
    })();

    stop();
    await collect();
    expect(first.deref()).toBeUndefined();
    expect(second.deref()).toBeUndefined();
    source.set(1);
  });

  it("remains connected until both subscribers are cancelled", async () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value);
    const { ref, stopFirst, stopSecond } = (() => {
      const value = create(source, compute);
      return {
        ref: new WeakRef(value),
        stopFirst: value.subscribe(() => {}, { sync: true }),
        stopSecond: value.subscribe(() => {}, { sync: true }),
      };
    })();

    stopFirst();
    source.set(1);
    expect(compute).toHaveBeenCalledTimes(2);
    await collect();
    expect(ref.deref()).toBeDefined();
    stopSecond();
    await collect();
    expect(ref.deref()).toBeUndefined();
    source.set(2);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("keeps a computed observer connected after the last effect is cancelled", async () => {
    const source = writable(0);
    const first = create(source, (value) => value + 1);
    const stop = first.subscribe(() => {}, { sync: true });
    const ref = (() => {
      const second = create(first, (value) => value + 1);
      expect(second.get()).toBe(2);
      return new WeakRef(second);
    })();

    await collect();
    expect(ref.deref()).toBeDefined();
    stop();
    source.set(1);
    expect(ref.deref()!.get()).toBe(3);
    ref.deref()!.dispose();
    await collect();
    expect(ref.deref()).toBeUndefined();
  });

  it("disconnects an upstream only after its last computed observer leaves", async () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value);
    const { ref, left, right, stop } = (() => {
      const first = create(source, compute);
      const left = create(first, (value) => value + 1);
      const right = create(first, (value) => value + 2);
      expect(left.get()).toBe(1);
      expect(right.get()).toBe(2);
      return {
        ref: new WeakRef(first),
        left,
        right,
        stop: first.subscribe(() => {}, { sync: true }),
      };
    })();

    left.dispose();
    stop();
    await collect();
    expect(ref.deref()).toBeDefined();
    source.set(1);
    expect(right.get()).toBe(3);
    expect(compute).toHaveBeenCalledTimes(2);

    right.dispose();
    await collect();
    expect(ref.deref()).toBeUndefined();
    source.set(2);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("releases a failed observer when it is disposed", async () => {
    const source = writable(0);
    const error = new Error("compute");
    const ref = (() => {
      const value = create(source, () => {
        throw error;
      });
      expect(() => value.get()).toThrow(error);
      value.dispose();
      return new WeakRef(value);
    })();

    await collect();
    expect(ref.deref()).toBeUndefined();
    source.set(1);
  });

  it("validates an invalidated cache before adding an effect", () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value);
    const value = create(source, compute);
    expect(value.get()).toBe(0);
    source.set(1);
    const seen = vi.fn();
    const stop = value.subscribe(seen, { sync: true });
    source.set(2);
    expect(seen.mock.calls).toEqual([[1], [2]]);
    expect(compute).toHaveBeenCalledTimes(3);
    stop();
  });

  it("preserves a restored output when adding an effect", () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value);
    const value = create(source, compute);
    expect(value.get()).toBe(0);
    batch(() => {
      source.set(1);
      source.set(0);
    });
    const seen = vi.fn();
    const stop = value.subscribe(seen, { sync: true });
    expect(seen.mock.calls).toEqual([[0]]);
    source.set(2);
    expect(seen.mock.calls).toEqual([[0], [2]]);
    stop();
  });

  it("recomputes a disconnected chain when it becomes active again", () => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value % 2);
    const first = create(source, compute);
    const secondCompute = vi.fn((value: number) => value + 1);
    const second = create(first, secondCompute);
    const stop = second.subscribe(() => {}, { sync: true });
    stop();

    source.set(2);
    const seen = vi.fn();
    const stopAgain = second.subscribe(seen, { sync: true, immediate: false });
    expect(second.get()).toBe(1);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(secondCompute).toHaveBeenCalledTimes(2);
    source.set(3);
    expect(seen.mock.calls).toEqual([[2]]);
    stopAgain();
    source.set(4);
    expect(second.get()).toBe(1);
    expect(secondCompute).toHaveBeenCalledTimes(4);
  });

  it("preserves a computed cache across unrelated writes", () => {
    const source = writable(0);
    const unrelated = writable(0);
    const compute = vi.fn((value: number) => value);
    const value = create(source, compute);
    expect(value.get()).toBe(0);
    for (let i = 1; i <= 3; i++) {
      unrelated.set(i);
      expect(value.get()).toBe(0);
    }
    expect(compute).toHaveBeenCalledOnce();
  });

  it("rejects writes from a computation in development", () => {
    const source = writable(0);
    const value = create(source, (input) => {
      source.set(input + 1);
      return input;
    });
    expect(() => value.get()).toThrow("write during computation");
    expect(source.get()).toBe(0);
    value.dispose();
    source.set(1);
    expect(source.get()).toBe(1);
  });

  it("rejects writes from a computed equality callback", () => {
    const source = writable(0);
    const other = writable(0);
    const value = create(source, (input) => input);
    const guarded = computed(() => value.get(), {
      equal: (a, b) => {
        other.set(b);
        return a === b;
      },
    });
    expect(guarded.get()).toBe(0);
    source.set(1);
    expect(() => guarded.get()).toThrow("write during computation");
    expect(other.get()).toBe(0);
    guarded.dispose();
    value.dispose();
  });

  it("allows effect writes after a pure computation", () => {
    const source = writable(0);
    const value = create(source, (input) => input * 2);
    const seen: number[] = [];
    const stop = value.subscribe(
      (input) => {
        seen.push(input);
        if (input === 2) source.set(2);
      },
      { sync: true },
    );
    source.set(1);
    expect(seen).toEqual([0, 2, 4]);
    stop();
    value.dispose();
  });
});

it("releases obsolete computed branches while the outer watch stays active", async () => {
  const source = writable(0);
  const chooseFirst = writable(true);
  const { ref, stop } = (() => {
    const first = computed(() => source.get() + 1);
    const ref = new WeakRef(first);
    let branch: Readable<number> | undefined = first;
    const stop = watch(
      () => {
        if (chooseFirst.get()) branch!.get();
        else branch = undefined;
      },
      { sync: true },
    );
    return { ref, stop };
  })();

  chooseFirst.set(false);
  await collect();
  expect(ref.deref()).toBeUndefined();
  source.set(1);
  stop();
});

it("releases obsolete computed branches without an effect", async () => {
  const source = writable(0);
  const chooseFirst = writable(true);
  const { ref, outer } = (() => {
    const first = computed(() => source.get() + 1);
    let branch: Readable<number> | undefined = first;
    return {
      ref: new WeakRef(first),
      outer: computed(() => {
        if (chooseFirst.get()) {
          return branch!.get();
        }
        branch = undefined;
        return 0;
      }),
    };
  })();

  expect(outer.get()).toBe(1);
  chooseFirst.set(false);
  expect(outer.get()).toBe(0);
  await collect();
  expect(ref.deref()).toBeUndefined();
  source.set(1);
  expect(outer.get()).toBe(0);
  outer.dispose();
});

it("detaches duplicate static links without disconnecting another observer", async () => {
  const source = writable(0);
  const seen = vi.fn();
  const stopSource = source.subscribe(seen, { sync: true });
  const { ref, stop } = (() => {
    const value = derived([source, source], (first, second) => first + second);
    return { ref: new WeakRef(value), stop: value.subscribe(() => {}, { sync: true }) };
  })();

  stop();
  await collect();
  expect(ref.deref()).toBeUndefined();
  source.set(1);
  expect(seen.mock.calls).toEqual([[0], [1]]);
  stopSource();
});

it.each([false, true])("a disposed source releases downstream callbacks, computed=%s", async (memo) => {
  const source = memo ? computed(() => 1) : writable(1);
  const callback = (() => {
    const callback = () => {};
    source.subscribe(callback, { immediate: false });
    return new WeakRef(callback);
  })();
  source.dispose();
  await collect();
  expect(callback.deref()).toBeUndefined();
  expect(source.get()).toBe(1);
});
