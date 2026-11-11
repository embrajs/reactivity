import { describe, expect, it, vi } from "vitest";
import { batch, computed, derived, watch, writable } from "../src";

describe("effect scheduling", () => {
  it.each([
    false,
    true,
  ])("requeues an earlier skipped effect when a later callback writes its input, sync=%s", async (sync) => {
    const trigger = writable(0);
    const source = writable(0);
    const callback = vi.fn();
    const cleanup = vi.fn();
    const stopWriter = trigger.subscribe(
      (value) => {
        if (value === 1) source.set(2);
      },
      { sync, immediate: false },
    );
    const stopReader = watch(
      () => {
        callback(source.get());
        return cleanup;
      },
      { sync },
    );

    batch(() => {
      source.set(1);
      source.set(0);
      trigger.set(1);
    });
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[0], [2]]);
    expect(cleanup).toHaveBeenCalledOnce();
    stopReader();
    stopWriter();
  });

  it("finishes the current source broadcast before delivering a reverted value", () => {
    const source = writable(0);
    const calls: string[] = [];
    const stopFirst = source.subscribe(
      (value) => {
        calls.push(`first:${value}`);
        if (value === 1) source.set(0);
      },
      { sync: true, immediate: false },
    );
    const stopSecond = source.subscribe((value) => calls.push(`second:${value}`), { sync: true, immediate: false });
    source.set(1);
    expect(calls).toEqual(["first:1", "second:1", "first:0", "second:0"]);
    stopFirst();
    stopSecond();
  });

  it("skips an asynchronous effect whose input was reverted by an earlier callback", async () => {
    const source = writable(0);
    const calls: string[] = [];
    const stopFirst = watch(() => {
      const value = source.get();
      calls.push(`first:${value}`);
      if (value === 1) source.set(0);
    });
    const stopSecond = watch(() => {
      calls.push(`second:${source.get()}`);
    });
    calls.length = 0;
    source.set(1);
    await Promise.resolve();
    expect(calls).toEqual(["first:1", "first:0"]);
    stopFirst();
    stopSecond();
  });

  it.each([
    false,
    true,
  ])("preserves an asynchronous resource after synchronous reads of reverted input, fixed=%s", async (fixed) => {
    const source = writable(0);
    const cleanup = vi.fn();
    const callback = vi.fn();
    const stopSync = watch(
      () => {
        source.get();
      },
      { sync: true },
    );
    const input = fixed ? derived(source, (value) => value) : computed(() => source.get());
    const stopAsync = watch(() => {
      callback(input.get());
      return cleanup;
    });
    source.set(1);
    expect(input.get()).toBe(1);
    source.set(0);
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[0]]);
    expect(cleanup).not.toHaveBeenCalled();
    source.set(2);
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[0], [2]]);
    expect(cleanup).toHaveBeenCalledOnce();
    stopAsync();
    stopSync();
    input.dispose();
  });

  it("broadcasts to the whole asynchronous group when a subscriber joins pending work", async () => {
    const source = writable(0);
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = source.subscribe(first);
    const stopSecond = batch(() => {
      source.set(1);
      const stop = source.subscribe(second);
      source.set(0);
      return stop;
    });
    await Promise.resolve();
    expect(first.mock.calls).toEqual([[0], [0]]);
    expect(second.mock.calls).toEqual([[1], [0]]);
    stopFirst();
    stopSecond();
  });

  it.each([false, true])("compares asynchronous resources with custom output equality, fixed=%s", async (fixed) => {
    const source = writable(0);
    const equal = (a: { id: number }, b: { id: number }) => a.id === b.id;
    const input = fixed
      ? derived(source, (value) => ({ id: value % 10 }), { equal })
      : computed(() => ({ id: source.get() % 10 }), { equal });
    const callback = vi.fn();
    const cleanup = vi.fn();
    const stopSync = watch(
      () => {
        input.get();
      },
      { sync: true },
    );
    const stopAsync = watch(() => {
      callback(input.get().id);
      return cleanup;
    });

    source.set(1);
    source.set(10);
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[0]]);
    expect(cleanup).not.toHaveBeenCalled();

    source.set(11);
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[0], [1]]);
    expect(cleanup).toHaveBeenCalledOnce();
    stopAsync();
    stopSync();
    input.dispose();
  });

  it("defers synchronous work until the current asynchronous pass finishes", async () => {
    const trigger = writable(0);
    const source = writable(0);
    const calls: string[] = [];
    const stopSync = source.subscribe((value) => calls.push(`sync:${value}`), { sync: true, immediate: false });
    const stopFirst = watch(() => {
      if (trigger.get() === 1) {
        calls.push("first:start");
        source.set(1);
        calls.push("first:end");
      }
    });
    const stopSecond = watch(() => {
      const value = source.get();
      if (trigger.get() === 1) calls.push(`second:${value}`);
    });
    trigger.set(1);
    await Promise.resolve();
    expect(calls).toEqual(["first:start", "first:end", "second:1", "sync:1"]);
    stopFirst();
    stopSecond();
    stopSync();
  });

  it("cancels an asynchronous effect disposed before its turn", async () => {
    const source = writable(0);
    const second = vi.fn();
    let stopSecond = () => {};
    const stopFirst = source.subscribe(() => stopSecond(), { immediate: false });
    stopSecond = source.subscribe(second, { immediate: false });
    source.set(1);
    await Promise.resolve();
    expect(second).not.toHaveBeenCalled();
    stopFirst();
  });

  it("compares all asynchronous inputs when one input reverts", async () => {
    const first = writable(0);
    const second = writable(0);
    const callback = vi.fn();
    const input = derived([first, second], (a, b) => [a, b] as const);
    const stop = input.subscribe((values) => callback(...values), { immediate: false });
    const stopSync = first.subscribe(() => {}, { sync: true, immediate: false });
    first.set(1);
    first.set(0);
    second.set(2);
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[0, 2]]);
    stop();
    stopSync();
    input.dispose();
  });
});
