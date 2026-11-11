import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { computed, derived, type EffectContext, type Subscriber, watch, writable } from "../src";

describe("source.subscribe", () => {
  it("delivers immediately and coalesces later writes", async () => {
    const source = writable(0);
    const callback = vi.fn();
    const stop = source.subscribe(callback);
    expect(callback.mock.calls).toEqual([[0]]);
    source.set(1);
    source.set(2);
    expect(callback.mock.calls).toEqual([[0]]);
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[0], [2]]);
    stop();
  });

  it("infers the source value and supports cancellation during initialization", async () => {
    const source = writable(0);
    const callback = vi.fn();
    const stop = source.subscribe(function (value) {
      expectTypeOf(this).toEqualTypeOf<EffectContext>();
      expectTypeOf(value).toEqualTypeOf<number>();
      callback(value);
      this.dispose();
    });
    source.set(1);
    await Promise.resolve();
    stop();
    expect(callback.mock.calls).toEqual([[0]]);
  });

  it("shares the callback context contract with computed subscriptions", () => {
    const source = writable(1);
    const value = computed(() => source.get() * 2);
    const callback = vi.fn();
    const subscriber: Subscriber<number> = function (next) {
      expectTypeOf(this).toEqualTypeOf<EffectContext>();
      callback(next);
      this.dispose();
    };
    const stopSource = source.subscribe(subscriber, { sync: true });
    const stopValue = value.subscribe(subscriber, { sync: true });
    source.set(2);
    expect(callback.mock.calls).toEqual([[1], [2]]);
    stopSource();
    stopValue();
    value.dispose();
  });

  it("retains one context across broadcasts and permits repeated disposal", () => {
    const source = writable(0);
    const contexts: EffectContext[] = [];
    const callback = vi.fn();
    const stop = source.subscribe(
      function (value) {
        contexts.push(this);
        callback(value);
      },
      { sync: true },
    );
    source.set(1);
    expect(contexts[1]).toBe(contexts[0]);
    contexts[0].dispose();
    contexts[0].dispose();
    source.set(2);
    stop();
    expect(callback.mock.calls).toEqual([[0], [1]]);
  });

  it("rebuilds a provider-selected subscription in an outer watch", () => {
    const selected = writable(true),
      first = writable(0),
      second = writable(10);
    const provider = {
      get $() {
        return selected.get() ? first : second;
      },
    };
    const callback = vi.fn();
    const effect = vi.fn(() => provider.$.subscribe(callback, { sync: true }));
    const stop = watch(effect, { sync: true });
    first.set(1);
    expect(effect).toHaveBeenCalledOnce();
    selected.set(false);
    first.set(2);
    second.set(11);
    expect(callback.mock.calls).toEqual([[0], [1], [10], [11]]);
    expect(effect).toHaveBeenCalledTimes(2);
    stop();
    second.set(12);
    expect(callback).toHaveBeenCalledTimes(4);
  });

  it("subscribes to an explicit multi-input derived value", async () => {
    const first = writable(0),
      second = writable("a");
    const value = derived([first, { $: second }], (a, b) => [a, b] as const);
    const callback = vi.fn();
    const stop = value.subscribe(function (next) {
      expectTypeOf(next).toEqualTypeOf<readonly [number, string]>();
      expectTypeOf(this).toEqualTypeOf<EffectContext>();
      callback(next);
    });
    first.set(1);
    second.set("b");
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[[0, "a"]], [[1, "b"]]]);
    stop();
    value.dispose();
  });

  it("primes a computed input when immediate delivery is disabled", () => {
    const source = writable(1);
    const compute = vi.fn(() => source.get() * 2);
    const value = computed(compute);
    const callback = vi.fn();
    const stop = value.subscribe(callback, { sync: true, immediate: false });
    expect(compute).toHaveBeenCalledOnce();
    expect(callback).not.toHaveBeenCalled();
    source.set(2);
    expect(callback.mock.calls).toEqual([[4]]);
    expect(compute).toHaveBeenCalledTimes(2);
    stop();
    value.dispose();
  });

  it("refreshes a dependency diamond before broadcasting its result", () => {
    const source = writable(1);
    const first = computed(() => source.get() * 2);
    const second = computed(() => first.get() + 1);
    const result = derived([source, first, second], (a, b, c) => [a, b, c] as const);
    const callback = vi.fn();
    const stop = result.subscribe(callback, { sync: true });
    source.set(2);
    expect(callback.mock.calls).toEqual([[[1, 2, 3]], [[2, 4, 5]]]);
    stop();
    result.dispose();
    second.dispose();
    first.dispose();
  });

  it("initializes a dirty computed before taking its group baseline", async () => {
    const source = writable(0);
    const value = computed(() => source.get());
    expect(value.get()).toBe(0);
    source.set(1);
    const callback = vi.fn();
    const stop = value.subscribe(callback);
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[1]]);
    stop();
    value.dispose();
  });

  it("ignores callback return values", () => {
    const source = writable(0);
    const cleanup = vi.fn();
    const stop = source.subscribe(() => cleanup, { sync: true });
    source.set(1);
    stop();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("does not collect subscription initialization or callback reads in an outer watch", () => {
    const source = writable(0),
      hidden = writable(0),
      tracked = writable(0);
    const callback = vi.fn(() => {
      hidden.get();
    });
    const parent = vi.fn();
    const stop = watch(
      () => {
        const stopChild = source.subscribe(callback, { sync: true });
        parent(tracked.get());
        return stopChild;
      },
      { sync: true },
    );
    hidden.set(1);
    source.set(1);
    expect(parent.mock.calls).toEqual([[0]]);
    expect(callback).toHaveBeenCalledTimes(2);
    tracked.set(1);
    expect(parent.mock.calls).toEqual([[0], [1]]);
    stop();
  });

  it("does not collect a computed subscription's upstream inputs in an outer watch", () => {
    const source = writable(0),
      tracked = writable(0);
    const value = computed(() => source.get());
    const parent = vi.fn();
    const stop = watch(
      () => {
        const stopChild = value.subscribe(() => {});
        parent(tracked.get());
        return stopChild;
      },
      { sync: true },
    );
    source.set(1);
    expect(parent.mock.calls).toEqual([[0]]);
    tracked.set(1);
    expect(parent.mock.calls).toEqual([[0], [1]]);
    stop();
    value.dispose();
  });

  it("cancels queued work through a retained callback context", async () => {
    const source = writable(0);
    let context!: EffectContext;
    const callback = vi.fn();
    const stop = source.subscribe(function (value) {
      context = this;
      callback(value);
    });
    source.set(1);
    context.dispose();
    source.set(2);
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[0]]);
    stop();
  });

  it("does not attach a subscription when its computed input throws", () => {
    const source = writable(0);
    const compute = vi.fn(() => {
      source.get();
      throw new Error("compute");
    });
    const value = computed(compute);
    const callback = vi.fn();
    expect(() => value.subscribe(callback, { sync: true, immediate: false })).toThrow("compute");
    source.set(1);
    expect(callback).not.toHaveBeenCalled();
    expect(compute).toHaveBeenCalledOnce();
    value.dispose();
  });

  it("releases its registration and writes when the initial callback throws", async () => {
    const source = writable(0);
    const callback = vi.fn(() => {
      source.set(1);
      throw new Error("callback");
    });
    expect(() => source.subscribe(callback)).toThrow("callback");
    source.set(2);
    await Promise.resolve();
    expect(callback).toHaveBeenCalledOnce();
  });

  it.each([false, true])("accepts frozen sources without attaching new subscriptions, sync=%s", async (sync) => {
    const frozen = writable(1);
    frozen.dispose();
    const callback = vi.fn();
    const stop = frozen.subscribe(callback, { sync });
    const live = writable(2);
    const value = derived([frozen, live], (a, b) => a + b);
    expect(value.get()).toBe(3);
    live.set(3);
    expect(value.get()).toBe(4);
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[1]]);
    stop();
    stop();
    value.dispose();
  });
});
