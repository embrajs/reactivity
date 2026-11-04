import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  batch,
  computed,
  derived,
  type Owned,
  type Readable,
  type ReadableLike,
  subscribe,
  watch,
  writable,
} from "../src";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("derived", () => {
  it("defers its computation and upstream computations until the first read", () => {
    const source = writable(1);
    const upstreamCompute = vi.fn(() => source.get() * 2);
    const upstream = computed(upstreamCompute);
    const compute = vi.fn((value: number) => value + 1);
    const value = derived({ $: upstream }, compute);

    expect(upstreamCompute).not.toHaveBeenCalled();
    expect(compute).not.toHaveBeenCalled();
    source.set(2);
    const get = value.get;
    expect(get()).toBe(5);
    expect(value.value).toBe(5);
    expect(upstreamCompute).toHaveBeenCalledOnce();
    expect(compute).toHaveBeenCalledOnce();
    source.set(3);
    expect(compute).toHaveBeenCalledOnce();
    expect(value.get()).toBe(7);
    expect(upstreamCompute).toHaveBeenCalledTimes(2);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("infers values from providers, mixed tuples and arrays", () => {
    const first = writable(1);
    const second = writable("a");
    const single = derived({ $: first }, (value) => {
      expectTypeOf(value).toEqualTypeOf<number>();
      return String(value);
    });
    expectTypeOf(single).toEqualTypeOf<Owned<Readable<string>>>();
    const tuple = derived([first, { $: second }], (a, b) => {
      expectTypeOf(a).toEqualTypeOf<number>();
      expectTypeOf(b).toEqualTypeOf<string>();
      return `${a}${b}`;
    });
    const sources = [{ $: second }, first] as const;
    const readonlyTuple = derived(sources, (a, b) => {
      expectTypeOf(a).toEqualTypeOf<string>();
      expectTypeOf(b).toEqualTypeOf<number>();
      return [a, b] as const;
    });
    expectTypeOf(readonlyTuple).toEqualTypeOf<Owned<Readable<readonly [string, number]>>>();
    const inputs: ReadableLike<number>[] = [first, { $: first }];
    const list = derived(inputs, (...values) => {
      expectTypeOf(values).toEqualTypeOf<number[]>();
      return values.reduce((sum, value) => sum + value, 0);
    });

    expect(single.get()).toBe("1");
    expect(tuple.get()).toBe("1a");
    expect(readonlyTuple.get()).toEqual(["a", 1]);
    expect(list.get()).toBe(2);
  });

  it("treats an array provider as a single dependency", () => {
    const source = writable("a");
    const other = writable(1);
    const provider = Object.assign([other] as const, { $: source });
    const compute = vi.fn((value: string) => value.toUpperCase());
    const value = derived(provider, compute);

    expect(value.get()).toBe("A");
    other.set(2);
    expect(value.get()).toBe("A");
    expect(compute).toHaveBeenCalledOnce();
    source.set("b");
    expect(value.get()).toBe("B");
    expect(compute.mock.calls).toEqual([["a"], ["b"]]);
  });

  it("prefers a direct readable over its provider property", () => {
    const other = writable("a");
    const source = Object.assign(writable(1), { $: other });
    const value = derived(source, (next) => {
      expectTypeOf(next).toEqualTypeOf<number>();
      return next * 2;
    });

    expect(value.get()).toBe(2);
    other.set("b");
    expect(value.get()).toBe(2);
    source.set(2);
    expect(value.get()).toBe(4);
  });

  it("resolves each provider position once and keeps its original source", () => {
    const first = writable(1);
    const second = writable(10);
    let selected = first;
    const get = vi.fn(() => selected);
    const provider = {
      get $() {
        return get();
      },
    };
    const value = derived([provider, provider], (a, b) => a + b);

    expect(get).toHaveBeenCalledTimes(2);
    selected = second;
    expect(value.get()).toBe(2);
    first.set(2);
    expect(value.get()).toBe(4);
    second.set(20);
    expect(value.get()).toBe(4);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("reads a single provider getter once before evaluation", () => {
    const source = writable(1);
    const get = vi.fn(() => source);
    const provider = {
      get $() {
        return get();
      },
    };
    const value = derived(provider, (next) => next * 2);

    expect(get).toHaveBeenCalledOnce();
    expect(value.get()).toBe(2);
    source.set(2);
    expect(value.get()).toBe(4);
    expect(get).toHaveBeenCalledOnce();
  });

  it("passes an array-valued single source as one argument without a receiver", () => {
    const input = [1, 2];
    const source = writable(input);
    const compute = vi.fn((values: number[]) => values.length);
    const value = derived(source, compute);

    expect(value.get()).toBe(2);
    expect(compute.mock.calls).toEqual([[input]]);
    source.set([3]);
    expect(value.get()).toBe(1);
    expect(compute.mock.contexts).toEqual([undefined, undefined]);
  });

  it("preserves input order and duplicate positions independently of the input array", () => {
    const first = writable(1);
    const second = writable(2);
    const sources = [second, first, second];
    const compute = vi.fn((...values: number[]) => values.join(","));
    const value = derived(sources, compute);
    sources.fill(first);

    expect(value.get()).toBe("2,1,2");
    first.set(3);
    second.set(4);
    expect(value.get()).toBe("4,3,4");
    expect(compute.mock.calls).toEqual([
      [2, 1, 2],
      [4, 3, 4],
    ]);
    expect(compute.mock.contexts).toEqual([undefined, undefined]);
  });

  it("evaluates an empty dependency list once with no arguments", () => {
    const result = {};
    const compute = vi.fn(() => result);
    const value = derived([], compute);

    expect(compute).not.toHaveBeenCalled();
    expect(value.get()).toBe(result);
    expect(value.get()).toBe(result);
    expect(compute.mock.calls).toEqual([[]]);
  });

  it("caches a returned function as a value", () => {
    const callback = vi.fn();
    const value = derived(writable(0), () => callback);

    expect(value.get()).toBe(callback);
    value.dispose();
    expect(callback).not.toHaveBeenCalled();
  });

  it("initializes undefined without comparing or recomputing it", () => {
    const source = writable(0);
    const compute = vi.fn(() => undefined);
    const equal = vi.fn(() => true);
    const value = derived(source, compute, { equal });

    expect(value.get()).toBeUndefined();
    expect(value.get()).toBeUndefined();
    expect(compute).toHaveBeenCalledOnce();
    expect(equal).not.toHaveBeenCalled();
    source.set(1);
    expect(value.get()).toBeUndefined();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(equal.mock.calls).toEqual([[undefined, undefined]]);
  });

  describe("dependencies", () => {
    it("lets a provider getter rebuild a derived inside an outer watch", () => {
      const selectFirst = writable(true);
      const first = writable(1);
      const second = writable(10);
      const provider = {
        get $() {
          return selectFirst.get() ? first : second;
        },
      };
      const spy = vi.fn();
      const stop = watch(
        () => {
          const value = derived(provider, (next) => next * 2);
          spy(value.get());
          return () => value.dispose();
        },
        { sync: true },
      );

      selectFirst.set(false);
      first.set(2);
      second.set(11);
      expect(spy.mock.calls).toEqual([[2], [20], [22]]);
      stop();
      second.set(12);
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it("ignores extra callback reads and restores the surrounding observation context", () => {
      const source = writable(0);
      const hidden = writable(10);
      const other = writable(0);
      const value = derived(source, (next) => next + hidden.get());
      const spy = vi.fn();
      const stop = watch(
        () => {
          spy(value.get(), other.get());
        },
        { sync: true },
      );

      hidden.set(20);
      expect(value.get()).toBe(10);
      expect(spy.mock.calls).toEqual([[10, 0]]);
      other.set(1);
      source.set(1);
      expect(spy.mock.calls).toEqual([
        [10, 0],
        [10, 1],
        [21, 1],
      ]);
      stop();
    });

    it("retains declared inputs even when the callback does not use them", () => {
      const selectFirst = writable(true);
      const first = writable(1);
      const second = writable(2);
      const compute = vi.fn((select: boolean, a: number, b: number) => (select ? a : b));
      const value = derived([selectFirst, first, second], compute);

      expect(value.get()).toBe(1);
      second.set(3);
      expect(value.get()).toBe(1);
      expect(compute).toHaveBeenCalledTimes(2);
      selectFirst.set(false);
      expect(value.get()).toBe(3);
      first.set(4);
      expect(value.get()).toBe(3);
      expect(compute).toHaveBeenCalledTimes(4);
    });

    it("updates a mixed computed and derived diamond without intermediate values", () => {
      const source = writable(1);
      const first = derived(source, (value) => value * 2);
      const second = computed(() => source.get() + 1);
      const sum = derived([first, second], (a, b) => a + b);
      const compute = vi.fn(() => sum.get() * 2);
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
        [1, 8],
        [2, 14],
      ]);
      expect(compute).toHaveBeenCalledTimes(2);
      stop();
    });

    it("refreshes inside a batch and delivers only the final result", () => {
      const first = writable(1);
      const second = writable(10);
      const value = derived([first, second], (a, b) => a + b);
      const spy = vi.fn();
      const stop = value.subscribe(spy, { sync: true });

      batch(() => {
        first.set(2);
        expect(value.get()).toBe(12);
        second.set(20);
        expect(value.get()).toBe(22);
        expect(spy.mock.calls).toEqual([[11]]);
      });
      expect(spy.mock.calls).toEqual([[11], [22]]);
      stop();
    });

    it("coalesces asynchronous notifications through the top-level subscribe", async () => {
      const source = writable(0);
      const value = derived(source, (next) => next * 2);
      const spy = vi.fn();
      const stop = subscribe(value, spy);

      source.set(1);
      source.set(2);
      expect(spy.mock.calls).toEqual([[0]]);
      await Promise.resolve();
      expect(spy.mock.calls).toEqual([[0], [4]]);
      stop();
    });
  });

  describe("equality", () => {
    it("preserves an equal cached reference and skips downstream computations", () => {
      const source = writable(0);
      const value = derived(source, (next) => ({ id: next % 2 }), { equal: (a, b) => a.id === b.id });
      const initial = value.get();
      const compute = vi.fn(() => value.get().id + 1);
      const downstream = computed(compute);
      const spy = vi.fn();
      const stop = downstream.subscribe(spy, { sync: true });

      source.set(2);
      expect(value.get()).toBe(initial);
      expect(compute).toHaveBeenCalledOnce();
      expect(spy.mock.calls).toEqual([[1]]);
      source.set(3);
      expect(value.get()).not.toBe(initial);
      expect(spy.mock.calls).toEqual([[1], [2]]);
      stop();
    });

    it("delivers equal results when equality is disabled", () => {
      const source = writable(0);
      const value = derived(source, (next) => next % 2, { equal: false });
      const spy = vi.fn();
      const stop = value.subscribe(spy, { sync: true });

      source.set(2);
      expect(spy.mock.calls).toEqual([[0], [0]]);
      stop();
    });
  });

  describe("errors", () => {
    it.each([new Error("compute"), undefined])("retries a thrown %j without an input change", (error) => {
      const source = writable(1);
      let fail = true;
      const compute = vi.fn((next: number) => {
        if (fail) throw error;
        return next * 2;
      });
      const value = derived(source, compute);

      for (let i = 0; i < 2; i++) {
        const noError = Symbol("no error");
        let thrown: unknown = noError;
        try {
          value.get();
        } catch (caught) {
          thrown = caught;
        }
        expect(thrown).toBe(error);
      }
      fail = false;
      expect(value.get()).toBe(2);
      expect(value.get()).toBe(2);
      expect(compute).toHaveBeenCalledTimes(3);
      source.set(2);
      expect(value.get()).toBe(4);
    });

    it("retains unread fixed inputs after an upstream refresh fails", () => {
      const first = writable(0);
      const trigger = writable(0);
      const last = writable(0);
      const error = new Error("upstream");
      let fail = false;
      const upstream = computed(() => {
        const next = trigger.get();
        if (fail) throw error;
        return next;
      });
      const compute = vi.fn((a: number, b: number, c: number) => a + b + c);
      const value = derived([first, upstream, last], compute);
      const downstream = computed(() => value.get() * 2);
      const spy = vi.fn();
      const stop = downstream.subscribe(spy, { sync: true });

      fail = true;
      expect(() =>
        batch(() => {
          first.set(1);
          trigger.set(1);
        }),
      ).toThrow(error);
      expect(compute).toHaveBeenCalledOnce();
      expect(spy.mock.calls).toEqual([[0]]);
      fail = false;
      last.set(2);
      expect(spy.mock.calls).toEqual([[0], [8]]);
      expect(compute).toHaveBeenCalledTimes(2);
      stop();
    });

    it("recovers downstream observers after its callback throws", () => {
      const first = writable(0);
      const second = writable(0);
      const error = new Error("compute");
      let fail = false;
      const value = derived([first, second], (a, b) => {
        if (fail) throw error;
        return a + b;
      });
      const spy = vi.fn();
      const stop = watch(
        () => {
          spy(value.get());
        },
        { sync: true },
      );

      fail = true;
      expect(() => first.set(1)).toThrow(error);
      expect(spy.mock.calls).toEqual([[0]]);
      fail = false;
      second.set(2);
      expect(spy.mock.calls).toEqual([[0], [3]]);
      stop();
    });

    it("does not commit a result when equality throws", () => {
      const source = writable(0);
      const error = new Error("equal");
      const equal = vi.fn((a: number, b: number) => a === b);
      const value = derived(source, (next) => next, { equal });
      const spy = vi.fn();
      const stop = value.subscribe(spy, { sync: true });
      equal.mockImplementationOnce(() => {
        throw error;
      });

      expect(() => source.set(1)).toThrow(error);
      expect(spy.mock.calls).toEqual([[0]]);
      expect(value.get()).toBe(1);
      expect(equal.mock.calls).toEqual([
        [0, 1],
        [0, 1],
      ]);
      source.set(2);
      expect(spy.mock.calls).toEqual([[0], [2]]);
      stop();
    });

    it("detects a mixed circular dependency and recovers when it is removed", () => {
      const circular = writable(false);
      const fallback = writable(1);
      const first = computed((): number => (circular.get() ? second.get() : fallback.get()));
      const second = derived(first, (next) => next + 1);
      const spy = vi.fn();
      const stop = second.subscribe(spy, { sync: true });

      expect(() => circular.set(true)).toThrow("loop detected");
      batch(() => {
        circular.set(false);
        fallback.set(3);
      });
      expect(spy.mock.calls).toEqual([[2], [4]]);
      stop();
    });
  });

  describe("dispose", () => {
    it("preserves its cache without recomputing or tracking later reads", () => {
      const source = writable(1);
      const other = writable(0);
      const compute = vi.fn((next: number) => next * 2);
      const value = derived(source, compute);

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

    it("does not refresh inputs or compute when disposed before its first read", () => {
      const upstreamCompute = vi.fn(() => 1);
      const upstream = computed(upstreamCompute);
      const compute = vi.fn((next: number) => next + 1);
      const value = derived(upstream, compute);

      value.dispose();
      expect(value.get()).toBeUndefined();
      expect(upstreamCompute).not.toHaveBeenCalled();
      expect(compute).not.toHaveBeenCalled();
    });

    it("preserves a disposed input's position while observing the remaining inputs", () => {
      const first = writable(1);
      const second = writable(2);
      const value = derived([first, second], (a, b) => a + b);

      expect(value.get()).toBe(3);
      first.dispose();
      second.set(4);
      expect(value.get()).toBe(5);
    });

    it("can be collected before its first read even with duplicate inputs", async () => {
      const source = writable(0);
      const compute = vi.fn((a: number, b: number) => a + b);
      const ref = (() => new WeakRef(derived([source, source], compute)))();

      await new Promise<void>((resolve) => setImmediate(resolve));
      globalThis.gc!();
      expect(ref.deref()).toBeUndefined();
      expect(compute).not.toHaveBeenCalled();
      source.set(1);
    });

    it("releases partially connected inputs when a later input is already disposed", async () => {
      const first = writable(0);
      const disposed = writable(0);
      disposed.dispose();
      vi.spyOn(console, "error").mockImplementation(() => {});
      const ref = (() => {
        const second = writable(1);
        const ref = new WeakRef(second);
        expect(() => derived([first, { $: second }, { $: disposed }], (a, b, c) => a + b + c)).toThrow("disposed");
        return ref;
      })();

      await new Promise<void>((resolve) => setImmediate(resolve));
      globalThis.gc!();
      expect(ref.deref()).toBeUndefined();
      first.set(1);
    });

    it("releases partially connected inputs when a provider getter throws", async () => {
      const first = writable(0);
      const error = new Error("provider");
      const provider = {
        get $(): Readable<number> {
          throw error;
        },
      };
      const ref = (() => {
        const second = writable(1);
        const ref = new WeakRef(second);
        expect(() => derived([first, { $: second }, provider], (a, b, c) => a + b + c)).toThrow(error);
        return ref;
      })();

      await new Promise<void>((resolve) => setImmediate(resolve));
      globalThis.gc!();
      expect(ref.deref()).toBeUndefined();
      first.set(1);
    });
  });
});
