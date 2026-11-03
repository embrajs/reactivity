import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  batch,
  computed,
  type EffectContext,
  type Readable,
  type ReadableLike,
  type Subscriber,
  subscribe,
  watch,
  writable,
} from "../src/reactivity";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("subscribe", () => {
  it("delivers a single source immediately and coalesces later writes", async () => {
    const source = writable(0);
    const spy = vi.fn();
    const stop = subscribe(source, spy);
    expect(spy.mock.calls).toEqual([[0]]);
    source.set(1);
    source.set(2);
    expect(spy.mock.calls).toEqual([[0]]);
    await Promise.resolve();
    expect(spy.mock.calls).toEqual([[0], [2]]);
    stop();
  });

  it("can cancel during the first single-source callback", async () => {
    const source = writable(0);
    const spy = vi.fn();
    const stop = subscribe(source, function (value) {
      expectTypeOf(this).toEqualTypeOf<EffectContext>();
      expectTypeOf(value).toEqualTypeOf<number>();
      spy(value);
      return this.dispose();
    });

    source.set(1);
    await Promise.resolve();
    stop();
    expect(spy.mock.calls).toEqual([[0]]);
  });

  it("supports self cancellation through readable subscribe methods", () => {
    const source = writable(1);
    const value = computed(() => source.get() * 2);
    const spy = vi.fn();
    const callback: Subscriber<number> = function (next) {
      expectTypeOf(this).toEqualTypeOf<EffectContext>();
      spy(next);
      this.dispose();
    };
    const stopSource = source.subscribe(callback, { sync: true });
    const stopValue = value.subscribe(callback, { sync: true });

    source.set(2);
    expect(spy.mock.calls).toEqual([[1], [2]]);
    stopSource();
    stopValue();
    value.dispose();
  });

  it("infers values for mixed readable and provider tuples", () => {
    const first = writable(1);
    const second = writable("a");
    const stop = subscribe([first, { $: second }], (a, b) => {
      expectTypeOf(a).toEqualTypeOf<number>();
      expectTypeOf(b).toEqualTypeOf<string>();
      expect([a, b]).toEqual([1, "a"]);
    });
    const sources = [{ $: first }, second] as const;
    const stopReadonly = subscribe(sources, (a, b) => {
      expectTypeOf(a).toEqualTypeOf<number>();
      expectTypeOf(b).toEqualTypeOf<string>();
    });
    const list: ReadableLike<number>[] = [first, { $: first }];
    const stopList = subscribe(list, (...values) => {
      expectTypeOf(values).toEqualTypeOf<number[]>();
    });
    stop();
    stopReadonly();
    stopList();
  });

  it.each([0, 1])("treats an array provider with %s elements as a single source", (length) => {
    const source = writable("a");
    const other = writable(1);
    const provider = Object.assign(
      Array.from({ length }, () => other),
      { $: source },
    );
    const spy = vi.fn();
    const stop = subscribe(
      provider,
      (value) => {
        expectTypeOf(value).toEqualTypeOf<string>();
        spy(value);
      },
      { sync: true },
    );

    other.set(2);
    expect(spy.mock.calls).toEqual([["a"]]);
    source.set("b");
    expect(spy.mock.calls).toEqual([["a"], ["b"]]);
    stop();
  });

  it("prefers a direct readable over its provider property", () => {
    const other = writable("a");
    const source = Object.assign(writable(1), { $: other });
    const spy = vi.fn();
    const stop = subscribe(
      source,
      (value) => {
        expectTypeOf(value).toEqualTypeOf<number>();
        spy(value);
      },
      { sync: true },
    );

    other.set("b");
    source.set(2);
    expect(spy.mock.calls).toEqual([[1], [2]]);
    stop();
  });

  it("resolves each provider position once and keeps its original source", () => {
    const first = writable(0);
    const second = writable(10);
    let selected = first;
    const get = vi.fn(() => selected);
    const provider = {
      get $() {
        return get();
      },
    };
    const spy = vi.fn();
    const stop = subscribe([provider, first, provider], spy, { sync: true });

    expect(get).toHaveBeenCalledTimes(2);
    selected = second;
    second.set(11);
    expect(spy.mock.calls).toEqual([[0, 0, 0]]);
    first.set(1);
    expect(spy.mock.calls).toEqual([
      [0, 0, 0],
      [1, 1, 1],
    ]);
    expect(get).toHaveBeenCalledTimes(2);
    stop();
    first.set(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("reads a single provider getter once before subscribing", () => {
    const source = writable(0);
    const get = vi.fn(() => source);
    const provider = {
      get $() {
        return get();
      },
    };
    const spy = vi.fn();
    const stop = subscribe(provider, spy, { sync: true });

    expect(get).toHaveBeenCalledOnce();
    source.set(1);
    expect(spy.mock.calls).toEqual([[0], [1]]);
    expect(get).toHaveBeenCalledOnce();
    stop();
  });

  it("lets a provider getter rebuild the subscription in an outer watch", () => {
    const selectFirst = writable(true);
    const first = writable(0);
    const second = writable(10);
    const provider = {
      get $() {
        return selectFirst.get() ? first : second;
      },
    };
    const spy = vi.fn();
    const effect = vi.fn(() => subscribe(provider, spy, { sync: true }));
    const stop = watch(effect, { sync: true });

    first.set(1);
    expect(effect).toHaveBeenCalledOnce();
    selectFirst.set(false);
    first.set(2);
    second.set(11);
    expect(spy.mock.calls).toEqual([[0], [1], [10], [11]]);
    expect(effect).toHaveBeenCalledTimes(2);
    stop();
    second.set(12);
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it("delivers current values in dependency order", () => {
    const first = writable(0);
    const second = writable("a");
    const spy = vi.fn();
    const stop = subscribe([first, second], spy, { sync: true });
    first.set(1);
    second.set("b");
    expect(spy.mock.calls).toEqual([
      [0, "a"],
      [1, "a"],
      [1, "b"],
    ]);
    stop();
  });

  it("coalesces changes to multiple inputs", async () => {
    const first = writable(0);
    const second = writable(0);
    const spy = vi.fn();
    const stop = subscribe([first, second], spy);
    first.set(1);
    second.set(2);
    first.set(3);
    await Promise.resolve();
    expect(spy.mock.calls).toEqual([
      [0, 0],
      [3, 2],
    ]);
    stop();
  });

  it("keeps the same context across multi-source callbacks", () => {
    const first = writable(0);
    const second = writable(0);
    const contexts: EffectContext[] = [];
    const spy = vi.fn();
    const stop = subscribe(
      [first, second],
      function (a, b) {
        expectTypeOf(this).toEqualTypeOf<EffectContext>();
        expectTypeOf(a).toEqualTypeOf<number>();
        expectTypeOf(b).toEqualTypeOf<number>();
        contexts.push(this);
        spy(a, b);
      },
      { sync: true },
    );
    first.set(1);
    expect(contexts).toHaveLength(2);
    expect(contexts[1]).toBe(contexts[0]);
    contexts[0].dispose();
    contexts[0].dispose();
    second.set(1);
    expect(spy.mock.calls).toEqual([
      [0, 0],
      [1, 0],
    ]);
    stop();
  });

  it("preserves duplicate parameter positions and removes both connections", () => {
    const source = writable(0);
    const spy = vi.fn();
    const neighbor = vi.fn();
    const stopNeighbor = source.subscribe(neighbor, { sync: true });
    const stop = subscribe([source, source], spy, { sync: true });
    source.set(1);
    expect(spy.mock.calls).toEqual([
      [0, 0],
      [1, 1],
    ]);
    stop();
    stop();
    source.set(2);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(neighbor.mock.calls).toEqual([[0], [1], [2]]);
    stopNeighbor();
  });

  it.each([false, true])("handles an empty dependency list with immediate: %s", (immediate) => {
    const spy = vi.fn(function (this: EffectContext) {
      this.dispose();
    });
    const stop = subscribe([], spy, { immediate });
    expect(spy.mock.calls).toEqual(immediate ? [[]] : []);
    stop();
    stop();
  });

  it("primes provided computed inputs even when immediate delivery is disabled", () => {
    const source = writable(1);
    const compute = vi.fn(() => source.get() * 2);
    const value = computed(compute);
    const spy = vi.fn();
    const stop = subscribe({ $: value }, spy, { sync: true, immediate: false });
    expect(compute).toHaveBeenCalledOnce();
    expect(spy).not.toHaveBeenCalled();
    source.set(2);
    expect(spy.mock.calls).toEqual([[4]]);
    expect(compute).toHaveBeenCalledTimes(2);
    stop();
  });

  it("refreshes every computed input before calling the subscriber", () => {
    const source = writable(1);
    const first = computed(() => source.get() * 2);
    const second = computed(() => first.get() + 1);
    const spy = vi.fn();
    const stop = subscribe([source, first, second], spy, { sync: true });
    source.set(2);
    expect(spy.mock.calls).toEqual([
      [1, 2, 3],
      [2, 4, 5],
    ]);
    stop();
  });

  it("initializes a dirty computed before taking its subscription snapshot", async () => {
    const source = writable(0);
    const value = computed(() => source.get());
    expect(value.get()).toBe(0);
    source.set(1);
    const spy = vi.fn();
    const stop = value.subscribe(spy);
    await Promise.resolve();
    expect(spy.mock.calls).toEqual([[1]]);
    stop();
  });

  it("ignores callback return values", () => {
    const first = writable(0);
    const second = writable(0);
    const cleanup = vi.fn();
    const stop = subscribe([first, second], () => cleanup, { sync: true });
    first.set(1);
    stop();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("does not collect extra callback reads or pollute a surrounding watch", () => {
    const first = writable(0);
    const second = writable(0);
    const hidden = writable(0);
    const tracked = writable(0);
    const callback = vi.fn(() => {
      hidden.get();
    });
    const spy = vi.fn();
    const stop = watch(
      () => {
        const unsubscribe = subscribe([first, second], callback);
        spy(tracked.get());
        return unsubscribe;
      },
      { sync: true },
    );
    hidden.set(1);
    expect(callback).toHaveBeenCalledOnce();
    tracked.set(1);
    expect(spy.mock.calls).toEqual([[0], [1]]);
    stop();
  });

  it("does not observe the upstream inputs of a computed separately", () => {
    const source = writable(0);
    const tracked = writable(0);
    const value = computed(() => source.get());
    const spy = vi.fn();
    const stop = watch(
      () => {
        const unsubscribe = subscribe([value], () => {});
        spy(tracked.get());
        return unsubscribe;
      },
      { sync: true },
    );
    source.set(1);
    expect(spy.mock.calls).toEqual([[0]]);
    tracked.set(1);
    expect(spy.mock.calls).toEqual([[0], [1]]);
    stop();
  });

  it("skips reverted inputs but delivers when another input changes", () => {
    const first = writable(0);
    const second = writable(0);
    const spy = vi.fn();
    const stop = subscribe([first, second], spy, { sync: true });
    batch(() => {
      first.set(1);
      first.set(0);
    });
    expect(spy.mock.calls).toEqual([[0, 0]]);
    batch(() => {
      first.set(1);
      first.set(0);
      second.set(1);
    });
    expect(spy.mock.calls).toEqual([
      [0, 0],
      [0, 1],
    ]);
    stop();
  });

  it("cancels queued work for all inputs", async () => {
    const first = writable(0);
    const second = writable(0);
    const spy = vi.fn();
    const stop = subscribe([first, second], spy, { immediate: false });
    first.set(1);
    stop();
    second.set(1);
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
  });

  it("can cancel queued work through a retained callback context", async () => {
    const source = writable(0);
    const contexts: EffectContext[] = [];
    const spy = vi.fn();
    const stop = subscribe(source, function (value) {
      contexts.push(this);
      spy(value);
    });

    source.set(1);
    contexts[0].dispose();
    source.set(2);
    await Promise.resolve();
    expect(spy.mock.calls).toEqual([[0]]);
    stop();
  });

  it.each([false, true])("can cancel all fixed inputs with immediate: %s", (immediate) => {
    const first = writable(0);
    const second = writable(0);
    const spy = vi.fn();
    const stop = subscribe(
      [first, second, first],
      function (...values) {
        spy(...values);
        this.dispose();
      },
      { sync: true, immediate },
    );
    first.set(1);
    second.set(1);
    expect(spy.mock.calls).toEqual(immediate ? [[0, 0, 0]] : [[1, 0, 1]]);
    stop();
  });

  it("retains frozen inputs after disposal while observing the remaining sources", () => {
    const first = writable(0);
    const second = writable(0);
    const spy = vi.fn();
    const stop = subscribe([first, second], spy, { sync: true });
    batch(() => {
      first.set(1);
      first.dispose();
    });
    expect(spy.mock.calls).toEqual([[0, 0]]);
    second.set(1);
    expect(spy.mock.calls).toEqual([
      [0, 0],
      [1, 1],
    ]);
    stop();
  });

  it("cancels partially initialized subscriptions if a computed input throws", () => {
    const first = writable(0);
    const source = writable(0);
    const error = new Error("compute");
    const compute = vi.fn(() => {
      source.get();
      throw error;
    });
    const value = computed(compute);
    const spy = vi.fn();
    expect(() => subscribe([first, value], spy, { sync: true, immediate: false })).toThrow(error);
    first.set(1);
    source.set(1);
    expect(spy).not.toHaveBeenCalled();
    expect(compute).toHaveBeenCalledOnce();
    value.dispose();
  });

  it("refreshes earlier inputs before validating later ones", () => {
    const error = new Error("compute");
    const compute = vi.fn(() => {
      throw error;
    });
    const first = computed(compute);
    const second = writable(0);
    second.dispose();
    const spy = vi.fn();
    const order: string[] = [];
    const firstProvider = {
      get $() {
        order.push("first");
        return first;
      },
    };
    const secondProvider = {
      get $() {
        order.push("second");
        return second;
      },
    };

    expect(() => subscribe([firstProvider, secondProvider], spy, { immediate: false })).toThrow(error);
    expect(order).toEqual(["first"]);
    expect(compute).toHaveBeenCalledOnce();
    expect(spy).not.toHaveBeenCalled();
    first.dispose();
  });

  it("cancels all inputs if the initial callback throws", async () => {
    const first = writable(0);
    const second = writable(0);
    const error = new Error("callback");
    const spy = vi.fn(() => {
      first.set(1);
      throw error;
    });
    expect(() => subscribe([first, second], spy)).toThrow(error);
    second.set(1);
    await Promise.resolve();
    expect(spy).toHaveBeenCalledOnce();
  });

  it("rejects a disposed source without retaining earlier inputs", () => {
    const first = writable(0);
    const second = computed(() => 1);
    const spy = vi.fn();
    second.dispose();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => subscribe([first, { $: second }], spy, { sync: true })).toThrow("disposed");
    first.set(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it("releases partially connected inputs when a provider getter throws", async () => {
    const first = writable(0);
    const error = new Error("provider");
    const provider = {
      get $(): Readable<number> {
        throw error;
      },
    };
    const spy = vi.fn();
    const ref = (() => {
      const second = writable(1);
      const ref = new WeakRef(second);
      expect(() => subscribe([first, { $: second }, provider], spy, { immediate: false })).toThrow(error);
      return ref;
    })();

    await new Promise<void>((resolve) => setImmediate(resolve));
    globalThis.gc!();
    expect(ref.deref()).toBeUndefined();
    first.set(1);
    expect(spy).not.toHaveBeenCalled();
  });
});
