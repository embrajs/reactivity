import { describe, expect, it, vi } from "vitest";
import * as api from "../src";
import { batch, computed, derived, watch, writable } from "../src";

describe("source-owned subscriptions", () => {
  it("only exports source.subscribe", () => {
    expect("subscribe" in api).toBe(false);
  });

  it.each([true, false])("compares a published input once for all subscribers, sync=%s", async (sync) => {
    const equal = vi.fn((a: number, b: number) => a === b);
    const source = writable<number>(0, { equal });
    const seen = Array.from({ length: 32 }, () => vi.fn());
    const stops = seen.map((callback) => source.subscribe(callback, { sync }));
    equal.mockClear();
    source.set(1);
    await Promise.resolve();
    expect(equal).toHaveBeenCalledTimes(2); // Source setter + one source broadcast.
    for (const callback of seen) {
      expect(callback.mock.calls).toEqual([[0], [1]]);
    }
    for (const stop of stops) {
      stop();
    }
  });

  it("keeps sync and async source consumption separate", async () => {
    const source = writable(0);
    const sync = vi.fn();
    const async = vi.fn();
    const stopSync = source.subscribe(sync, { sync: true });
    const stopAsync = source.subscribe(async);
    source.set(1);
    source.set(0);
    await Promise.resolve();
    expect(sync.mock.calls).toEqual([[0], [1], [0]]);
    expect(async.mock.calls).toEqual([[0]]);
    stopSync();
    stopAsync();
  });

  it("broadcasts the final value to a subscriber joining pending work", async () => {
    const source = writable(0);
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = source.subscribe(first);
    source.set(1);
    const stopSecond = source.subscribe(second);
    source.set(0);
    await Promise.resolve();
    expect(first.mock.calls).toEqual([[0], [0]]);
    expect(second.mock.calls).toEqual([[1], [0]]);
    stopFirst();
    stopSecond();
  });

  it("uses one captured argument per broadcast while get remains live", () => {
    const source = writable(0);
    const seen: unknown[] = [];
    const stopFirst = source.subscribe(
      (value) => {
        seen.push(["a", value]);
        if (value === 1) {
          source.set(2);
        }
      },
      { sync: true, immediate: false },
    );
    const stopSecond = source.subscribe((value) => seen.push(["b", value, source.get()]), {
      sync: true,
      immediate: false,
    });
    source.set(1);
    expect(seen).toEqual([
      ["a", 1],
      ["b", 1, 2],
      ["a", 2],
      ["b", 2, 2],
    ]);
    stopFirst();
    stopSecond();
  });

  it.each([true, false])("survives removing the next subscriber during delivery, sync=%s", async (sync) => {
    const source = writable(0);
    const seen: string[] = [];
    let stopSecond = () => {};
    const stopFirst = source.subscribe(
      () => {
        seen.push("a");
        stopSecond();
      },
      { sync, immediate: false },
    );
    stopSecond = source.subscribe(() => seen.push("b"), { sync, immediate: false });
    const stopThird = source.subscribe(() => seen.push("c"), { sync, immediate: false });
    source.set(1);
    await Promise.resolve();
    expect(seen).toEqual(["a", "c"]);
    stopFirst();
    stopThird();
  });

  it("updates the broadcast boundary when its tail is removed and a new listener is appended", () => {
    const source = writable(0);
    const seen: string[] = [];
    let stopTail = () => {};
    let stopNew = () => {};
    const stopFirst = source.subscribe(
      () => {
        seen.push("a");
        stopTail();
        stopNew = source.subscribe(() => seen.push("new"), { sync: true, immediate: false });
      },
      { sync: true, immediate: false },
    );
    const stopMiddle = source.subscribe(() => seen.push("b"), { sync: true, immediate: false });
    stopTail = source.subscribe(() => seen.push("tail"), { sync: true, immediate: false });
    source.set(1);
    expect(seen).toEqual(["a", "b"]);
    stopFirst();
    stopMiddle();
    stopNew();
  });

  it("supports self-disposal and removing an already delivered subscriber", () => {
    const source = writable(0);
    const seen: string[] = [];
    const stopFirst = source.subscribe(() => seen.push("a"), { sync: true, immediate: false });
    const stopSecond = source.subscribe(
      function () {
        seen.push("b");
        this.dispose();
        stopFirst();
      },
      { sync: true, immediate: false },
    );
    const stopThird = source.subscribe(() => seen.push("c"), { sync: true, immediate: false });
    source.set(1);
    source.set(2);
    expect(seen).toEqual(["a", "b", "c", "c"]);
    stopSecond();
    stopThird();
  });

  it("does not deliver twice to listeners appended during a running broadcast", () => {
    const source = writable(0);
    const seen: string[] = [];
    let stopNew = () => {};
    const stopFirst = source.subscribe(
      () => {
        seen.push("a");
        stopNew = source.subscribe(() => seen.push("new"), { sync: true });
      },
      { sync: true, immediate: false },
    );
    const stopLast = source.subscribe(() => seen.push("last"), { sync: true, immediate: false });
    source.set(1);
    expect(seen).toEqual(["a", "new", "last"]);
    stopFirst();
    stopLast();
    stopNew();
  });

  it("cancels the rest of a broadcast when its source is disposed", () => {
    const source = writable(0);
    const callback = vi.fn();
    const stopFirst = source.subscribe(() => source.dispose(), { sync: true, immediate: false });
    const stopSecond = source.subscribe(callback, { sync: true, immediate: false });
    source.set(1);
    expect(callback).not.toHaveBeenCalled();
    expect(source.get()).toBe(1);
    stopFirst();
    stopSecond();
  });

  it("aborts source peers on the first thrown callback and supports a fresh graph", () => {
    const source = writable(0);
    const callback = vi.fn();
    const stopFirst = source.subscribe(
      () => {
        throw new Error("callback");
      },
      { sync: true, immediate: false },
    );
    const stopSecond = source.subscribe(callback, { sync: true, immediate: false });
    expect(() => source.set(1)).toThrow("callback");
    expect(callback).not.toHaveBeenCalled();
    stopFirst();
    stopSecond();
    source.dispose();
    const fresh = writable(0);
    const stopFresh = fresh.subscribe(callback, { sync: true, immediate: false });
    fresh.set(2);
    expect(callback.mock.calls).toEqual([[2]]);
    stopFresh();
  });

  it.each([
    true,
    false,
  ])("counts subscriptions and watches together for recursive disconnection, static=%s", (fixed) => {
    const source = writable(0);
    const compute = vi.fn((value: number) => value + 1);
    const first = fixed ? derived(source, compute) : computed(() => compute(source.get()));
    const second = fixed ? derived(first, (value) => value + 1) : computed(() => first.get() + 1);
    const callback = vi.fn();
    const stopSub = second.subscribe(callback, { sync: true });
    const stopWatch = watch(
      () => {
        second.get();
      },
      { sync: true },
    );
    stopWatch();
    source.set(1);
    expect(callback.mock.calls).toEqual([[2], [3]]);
    stopSub();
    source.set(2);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(second.get()).toBe(4);
    expect(compute).toHaveBeenCalledTimes(3);
    second.dispose();
    first.dispose();
  });

  it("keeps pending async subscriptions after the last Watch is removed", async () => {
    const source = writable(0);
    const output = computed(() => source.get() * 2);
    const callback = vi.fn();
    const stopWatch = watch(
      () => {
        output.get();
      },
      { sync: true },
    );
    const stopSub = output.subscribe(callback);
    source.set(1);
    stopWatch();
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[0], [2]]);
    stopSub();
    output.dispose();
  });

  it("matches an independent evaluator over a mixed static/dynamic DAG", async () => {
    const a = writable(0),
      b = writable(0),
      toggle = writable(false);
    const left = derived([a, b], (a, b) => (a + b) % 7);
    const right = computed(() => (toggle.get() ? b.get() * 3 : a.get() * 2));
    const out = derived([left, right], (left, right) => left + right);
    const seen: number[] = [];
    const stop = out.subscribe((value) => seen.push(value));
    let seed = 7;
    for (let i = 0; i < 200; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const x = (seed >>> 8) & 31,
        y = (seed >>> 16) & 31,
        flag = !!(seed & 1);
      batch(() => {
        a.set(x);
        b.set(y);
        toggle.set(flag);
        if (seed & 2) {
          left.get();
        }
      });
      await Promise.resolve();
      expect(out.get()).toBe(((x + y) % 7) + (flag ? y * 3 : x * 2));
      expect(seen.at(-1)).toBe(out.get());
    }
    stop();
    out.dispose();
    right.dispose();
    left.dispose();
  });

  it("does not retain callbacks registered on a frozen disposed source", async () => {
    const source = writable(0);
    source.dispose();
    const ref = (() => {
      const callback = () => {};
      source.subscribe(callback);
      return new WeakRef(callback);
    })();
    await new Promise<void>((resolve) => setImmediate(resolve));
    globalThis.gc!();
    expect(ref.deref()).toBeUndefined();
    expect(source.get()).toBe(0);
  });
});
