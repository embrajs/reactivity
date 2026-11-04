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
  it.each([false, true])("can be collected without disposal after read=%s", async (read) => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value + 1);
    const ref = (() => {
      const value = create(source, compute);
      if (read) expect(value.get()).toBe(1);
      return new WeakRef(value);
    })();

    await collect();
    expect(ref.deref()).toBeUndefined();
    source.set(1);
    expect(compute).toHaveBeenCalledTimes(read ? 1 : 0);
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

  it("does not retain a passive consumer of an active computed", async () => {
    const source = writable(0);
    const first = create(source, (value) => value + 1);
    const stop = first.subscribe(() => {}, { sync: true });
    const ref = (() => {
      const second = create(first, (value) => value + 1);
      expect(second.get()).toBe(2);
      return new WeakRef(second);
    })();

    await collect();
    expect(ref.deref()).toBeUndefined();
    source.set(1);
    expect(first.get()).toBe(2);
    stop();
  });

  it("can collect a failed passive node", async () => {
    const source = writable(0);
    const error = new Error("compute");
    const ref = (() => {
      const value = create(source, () => {
        throw error;
      });
      expect(() => value.get()).toThrow(error);
      return new WeakRef(value);
    })();

    await collect();
    expect(ref.deref()).toBeUndefined();
    source.set(1);
  });

  it("validates a passive cache before activating it", () => {
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

  it("reuses a restored passive cache when activating it", () => {
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
    expect(compute).toHaveBeenCalledOnce();
    source.set(2);
    expect(seen.mock.calls).toEqual([[0], [2]]);
    stop();
  });

  it("validates each level when a passive chain becomes active again", () => {
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
    expect(secondCompute).toHaveBeenCalledOnce();
    source.set(3);
    expect(seen.mock.calls).toEqual([[2]]);
    stopAgain();
    source.set(4);
    expect(second.get()).toBe(1);
    expect(secondCompute).toHaveBeenCalledTimes(3);
  });

  it("preserves a passive cache across unrelated writes", () => {
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

  it("checks again after an input is written during passive evaluation", () => {
    const source = writable(0);
    const compute = vi.fn((input: number) => {
      if (input === 0) source.set(1);
      return input;
    });
    const value = create(source, compute);
    expect(value.get()).toBe(0);
    expect(value.get()).toBe(1);
    expect(value.get()).toBe(1);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])("checks writes when detached during evaluation, stopBeforeWrite=%s", (stopBeforeWrite) => {
    const source = writable(0);
    let stop = () => {};
    const compute = vi.fn((input: number) => {
      if (input === 1) {
        if (stopBeforeWrite) stop();
        source.set(2);
        if (!stopBeforeWrite) stop();
      }
      return input;
    });
    const value = create(source, compute);
    stop = value.subscribe(() => {}, { sync: true });
    source.set(1);
    expect(value.get()).toBe(2);
    expect(value.get()).toBe(2);
    expect(compute).toHaveBeenCalledTimes(3);
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
