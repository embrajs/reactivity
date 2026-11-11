import { afterEach, describe, expect, it, vi } from "vitest";
import { batch, computed, watch, writable } from "../src";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("computed", () => {
  it("evaluates lazily and caches until a dependency changes", () => {
    const source = writable(1);
    const compute = vi.fn(() => source.get() * 2);
    const value = computed(compute);
    expect(compute).not.toHaveBeenCalled();

    const get = value.get;
    expect(get()).toBe(2);
    expect(value.value).toBe(2);
    expect(compute).toHaveBeenCalledOnce();
    source.set(2);
    expect(compute).toHaveBeenCalledOnce();
    expect(get()).toBe(4);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("caches a constant without dependencies", () => {
    const compute = vi.fn(() => ({ value: 1 }));
    const value = computed(compute);
    expect(value.get()).toBe(value.get());
    expect(compute).toHaveBeenCalledOnce();
  });

  it("initializes undefined without calling the comparator", () => {
    const source = writable(0);
    const equal = vi.fn(() => true);
    const compute = vi.fn(() => {
      source.get();
      return undefined;
    });
    const value = computed(compute, { equal });
    expect(value.get()).toBeUndefined();
    expect(value.get()).toBeUndefined();
    expect(compute).toHaveBeenCalledOnce();
    expect(equal).not.toHaveBeenCalled();

    source.set(1);
    expect(value.get()).toBeUndefined();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(equal.mock.calls).toEqual([[undefined, undefined]]);
  });

  it("treats a returned function as a value", () => {
    const callback = vi.fn();
    const value = computed(() => callback);
    expect(value.get()).toBe(callback);
    value.dispose();
    expect(callback).not.toHaveBeenCalled();
  });

  it("preserves the parent observation context around a nested computation", () => {
    const before = writable(0);
    const source = writable(0);
    const after = writable(0);
    const compute = vi.fn(() => source.get() * 2);
    const value = computed(compute);
    const spy = vi.fn();
    const stop = watch(
      () => {
        spy(before.get(), value.get(), after.get());
      },
      { sync: true },
    );

    before.set(1);
    after.set(1);
    source.set(1);
    expect(spy.mock.calls).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [1, 2, 1],
    ]);
    expect(compute).toHaveBeenCalledTimes(2);
    stop();
  });

  describe("dependencies", () => {
    it("switches conditional dependencies in both directions", () => {
      const condition = writable(true);
      const first = writable(1);
      const second = writable(2);
      const compute = vi.fn(() => (condition.get() ? first.get() : second.get()));
      const value = computed(compute);

      expect(value.get()).toBe(1);
      second.set(3);
      expect(value.get()).toBe(1);
      expect(compute).toHaveBeenCalledOnce();
      condition.set(false);
      expect(value.get()).toBe(3);
      first.set(4);
      expect(value.get()).toBe(3);
      expect(compute).toHaveBeenCalledTimes(2);
      condition.set(true);
      expect(value.get()).toBe(4);
      second.set(5);
      expect(value.get()).toBe(4);
      expect(compute).toHaveBeenCalledTimes(3);
    });

    it("reuses dependencies across reordered and repeated reads", () => {
      const reverse = writable(false);
      const first = writable(1);
      const second = writable(2);
      const added = writable(3);
      const value = computed(() =>
        reverse.get()
          ? [second.get(), first.get(), added.get(), second.get()]
          : [first.get(), second.get(), first.get()],
      );

      expect(value.get()).toEqual([1, 2, 1]);
      reverse.set(true);
      expect(value.get()).toEqual([2, 1, 3, 2]);
      added.set(4);
      expect(value.get()).toEqual([2, 1, 4, 2]);
      reverse.set(false);
      const previous = value.get();
      added.set(5);
      expect(value.get()).toBe(previous);
      first.set(6);
      expect(value.get()).toEqual([6, 2, 6]);
    });

    it("skips downstream computations when an upstream result is unchanged", () => {
      const source = writable(0);
      const inner = vi.fn(() => source.get() % 2);
      const first = computed(inner);
      const outer = vi.fn(() => first.get() + 1);
      const second = computed(outer);
      const spy = vi.fn();
      const stop = watch(
        () => {
          spy(second.get());
        },
        { sync: true },
      );

      source.set(2);
      expect(spy.mock.calls).toEqual([[1]]);
      expect(inner).toHaveBeenCalledTimes(2);
      expect(outer).toHaveBeenCalledOnce();
      source.set(3);
      expect(spy.mock.calls).toEqual([[1], [2]]);
      expect(outer).toHaveBeenCalledTimes(2);
      stop();
    });

    it("keeps reordered dependencies after skipping an unchanged upstream result", () => {
      const source = writable(0);
      const parity = computed(() => source.get() % 2);
      const first = writable("a");
      const second = writable("b");
      const compute = vi.fn(() => (parity.get() ? second.get() + first.get() : first.get() + second.get()));
      const value = computed(compute);

      expect(value.get()).toBe("ab");
      source.set(2);
      expect(value.get()).toBe("ab");
      expect(compute).toHaveBeenCalledOnce();
      source.set(3);
      expect(value.get()).toBe("ba");
      second.set("c");
      expect(value.get()).toBe("ca");
      source.set(4);
      expect(value.get()).toBe("ac");
      expect(compute).toHaveBeenCalledTimes(4);
    });

    it("processes effect writes after repeated computed reads", () => {
      const source = writable(0);
      const value = computed(() => source.get() * 2);
      const spy = vi.fn();
      const stop = watch(
        () => {
          const before = value.get();
          if (before === 0) {
            source.set(1);
            value.get();
            source.set(2);
          }
          spy(before, value.get());
        },
        { sync: true },
      );

      expect(spy.mock.calls).toEqual([
        [0, 4],
        [4, 4],
      ]);
      source.set(3);
      expect(spy.mock.calls).toEqual([
        [0, 4],
        [4, 4],
        [6, 6],
      ]);
      stop();
    });

    it("updates diamond dependencies without exposing intermediate values", () => {
      const source = writable(1);
      const first = computed(() => source.get() * 2);
      const second = computed(() => source.get() + 1);
      const compute = vi.fn(() => first.get() + second.get());
      const total = computed(compute);
      const spy = vi.fn();
      const stop = watch(
        () => {
          spy(source.get(), total.get());
        },
        { sync: true },
      );

      source.set(2);
      expect(spy.mock.calls).toEqual([
        [1, 4],
        [2, 7],
      ]);
      expect(compute).toHaveBeenCalledTimes(2);
      stop();
    });

    it("returns current values inside a batch and delivers only the final update", () => {
      const source = writable(1);
      const value = computed(() => source.get() * 2);
      const spy = vi.fn();
      const stop = value.subscribe(spy, { sync: true });

      batch(() => {
        source.set(2);
        expect(value.get()).toBe(4);
        source.set(3);
        expect(value.get()).toBe(6);
        expect(spy.mock.calls).toEqual([[2]]);
      });
      expect(spy.mock.calls).toEqual([[2], [6]]);
      stop();
    });

    it("refreshes its retained cache after its last subscription is cancelled", () => {
      const source = writable(0);
      const compute = vi.fn(() => source.get());
      const value = computed(compute);
      const stop = value.subscribe(() => {}, { sync: true });
      stop();
      source.set(1);
      source.set(2);
      expect(compute).toHaveBeenCalledOnce();
      expect(value.get()).toBe(2);
      expect(compute).toHaveBeenCalledTimes(2);
      value.dispose();
    });
  });

  describe("equality", () => {
    it("does not rerun observers or cleanup for an unchanged result", () => {
      const source = writable(0);
      const value = computed(() => source.get() % 2);
      const spy = vi.fn();
      const cleanup = vi.fn();
      const stop = watch(
        () => {
          spy(value.get());
          return cleanup;
        },
        { sync: true },
      );

      source.set(2);
      expect(spy.mock.calls).toEqual([[0]]);
      expect(cleanup).not.toHaveBeenCalled();
      source.set(3);
      expect(spy.mock.calls).toEqual([[0], [1]]);
      expect(cleanup).toHaveBeenCalledOnce();
      stop();
    });

    it("retains the cached reference when custom equality returns true", () => {
      const source = writable(0);
      const value = computed(() => ({ id: source.get() % 2 }), { equal: (a, b) => a.id === b.id });
      const initial = value.get();
      source.set(2);
      expect(value.get()).toBe(initial);
      source.set(3);
      expect(value.get()).toEqual({ id: 1 });
      expect(value.get()).not.toBe(initial);
    });

    it("delivers equal results when equality is disabled", () => {
      const source = writable(0);
      const value = computed(() => source.get() % 2, { equal: false });
      const spy = vi.fn();
      const stop = value.subscribe(spy, { sync: true });
      source.set(2);
      expect(spy.mock.calls).toEqual([[0], [0]]);
      stop();
    });

    it("skips coalesced changes that return to the observed result", async () => {
      const source = writable(0);
      const value = computed(() => source.get());
      const spy = vi.fn();
      const stop = value.subscribe(spy);
      source.set(1);
      expect(value.get()).toBe(1);
      source.set(0);
      expect(value.get()).toBe(0);
      await Promise.resolve();
      expect(spy.mock.calls).toEqual([[0]]);
      stop();
    });

    it("does not collect dependencies read by an equality function", () => {
      const source = writable(0);
      const hidden = writable(0);
      const compute = vi.fn(() => source.get());
      const value = computed(compute, {
        equal(a, b) {
          hidden.get();
          return a === b;
        },
      });
      const spy = vi.fn();
      const stop = watch(
        () => {
          spy(value.get());
        },
        { sync: true },
      );
      source.set(1);
      hidden.set(1);
      expect(spy.mock.calls).toEqual([[0], [1]]);
      expect(compute).toHaveBeenCalledTimes(2);
      stop();
    });
  });

  describe("dispose", () => {
    it("retains the last cached value without recomputing or tracking reads", () => {
      const source = writable(1);
      const other = writable(0);
      const compute = vi.fn(() => source.get() * 2);
      const value = computed(compute);
      expect(value.get()).toBe(2);
      source.set(2);
      value.dispose();
      value.dispose();
      expect(value.get()).toBe(2);
      expect(value.value).toBe(2);
      const spy = vi.fn();
      const stop = watch(
        () => {
          spy(value.get(), other.get());
        },
        { sync: true },
      );
      source.set(3);
      other.set(1);
      expect(spy.mock.calls).toEqual([
        [2, 0],
        [2, 1],
      ]);
      expect(compute).toHaveBeenCalledOnce();
      stop();
    });

    it("does not evaluate when disposed before its first read", () => {
      const compute = vi.fn(() => 1);
      const value = computed(compute);
      value.dispose();
      expect(value.get()).toBeUndefined();
      expect(compute).not.toHaveBeenCalled();
    });

    it("releases its upstream connection when disposed", async () => {
      const source = writable(0);
      const ref = (() => {
        const value = computed(() => source.get());
        value.get();
        value.dispose();
        return new WeakRef(value);
      })();
      await new Promise<void>((resolve) => setImmediate(resolve));
      globalThis.gc!();
      expect(ref.deref()).toBeUndefined();
      source.set(1);
    });
  });
});
