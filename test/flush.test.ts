import { describe, expect, it, vi } from "vitest";
import { batch, computed, derived, flush, watch, writable } from "../src";
import { record } from "../src/debug";
import { setDevMode } from "./setup";

describe("flush", () => {
  it("synchronously flushes queued asynchronous watch and subscribe callbacks", async () => {
    const source$ = writable(0);
    const watchCalls: number[] = [];
    const subCalls: number[] = [];

    const stopWatch = watch(() => {
      watchCalls.push(source$.value);
    });
    const stopSub = source$.subscribe(
      (value) => {
        subCalls.push(value);
      },
      { immediate: false },
    );

    expect(watchCalls).toEqual([0]);
    expect(subCalls).toEqual([]);

    source$.value = 1;
    source$.value = 2;
    expect(watchCalls).toEqual([0]);
    expect(subCalls).toEqual([]);

    flush();
    expect(watchCalls).toEqual([0, 2]);
    expect(subCalls).toEqual([2]);

    await Promise.resolve();
    expect(watchCalls).toEqual([0, 2]);
    expect(subCalls).toEqual([2]);

    stopWatch();
    stopSub();
  });

  it("is a no-op on empty queues and emits no spurious debug events", async () => {
    const source$ = writable(0);
    const stop = watch(() => {
      source$.value;
    });

    const emptyResult = record(() => {
      flush();
    });
    expect(emptyResult.events).toEqual([]);
    expect(emptyResult.text).toBe("");

    source$.value = 1;
    flush();

    const afterResult = await record(async () => {
      await Promise.resolve();
    });
    expect(afterResult.events).toEqual([]);
    expect(afterResult.text).toBe("");

    stop();
  });

  it("flushes inside batch while keeping the outer batch active", () => {
    const source$ = writable(0);
    const syncSpy = vi.fn();
    const asyncSpy = vi.fn();

    const stopSync = source$.subscribe(syncSpy, { sync: true, immediate: false });
    const stopAsync = source$.subscribe(asyncSpy, { immediate: false });

    batch(() => {
      source$.value = 1;
      expect(syncSpy).not.toHaveBeenCalled();
      expect(asyncSpy).not.toHaveBeenCalled();

      flush();
      expect(syncSpy.mock.calls).toEqual([[1]]);
      expect(asyncSpy.mock.calls).toEqual([[1]]);

      source$.value = 2;
      source$.value = 3;
      expect(syncSpy.mock.calls).toEqual([[1]]);
      expect(asyncSpy.mock.calls).toEqual([[1]]);
    });

    expect(syncSpy.mock.calls).toEqual([[1], [3]]);
    expect(asyncSpy.mock.calls).toEqual([[1]]);

    flush();
    expect(asyncSpy.mock.calls).toEqual([[1], [3]]);

    stopSync();
    stopAsync();
  });

  it("handles re-entrant flush inside an effect without skipping or crashing", () => {
    const a$ = writable(0);
    const b$ = writable(0);
    const log: string[] = [];

    const stopA = watch(() => {
      const a = a$.value;
      log.push(`a:${a}`);
      if (a === 1) {
        b$.value = 1;
        flush();
        log.push("after-inner-flush");
      }
    });
    const stopB = watch(() => {
      log.push(`b:${b$.value}`);
    });

    log.length = 0;

    a$.value = 1;
    flush();

    expect(log).toEqual(["a:1", "b:1", "after-inner-flush"]);

    stopA();
    stopB();
  });

  it("clears pending queues and rethrows when an effect throws during flush", () => {
    const a$ = writable(0);
    const b$ = writable(0);
    const bSpy = vi.fn();

    let shouldThrow = false;
    const stopA = watch(() => {
      a$.value;
      if (shouldThrow) {
        throw new Error("flush-error");
      }
    });
    const stopB = watch(() => {
      bSpy(b$.value);
    });

    bSpy.mockClear();
    shouldThrow = true;

    a$.value = 1;
    b$.value = 1;

    expect(() => flush()).toThrow("flush-error");
    expect(bSpy).not.toHaveBeenCalled();

    // Discarded notifications do not fire on the next microtask either
    flush();
    expect(bSpy).not.toHaveBeenCalled();

    stopA();
    stopB();
  });

  it("throws in dev mode if called inside computed, derived, or equal", () => {
    const a$ = writable(0);
    const c$ = computed(() => {
      a$.value;
      flush();
      return 1;
    });
    expect(() => c$.value).toThrow("flush during computation");

    const d$ = derived(a$, () => {
      flush();
      return 2;
    });
    expect(() => d$.value).toThrow("flush during computation");

    const e$ = writable(0, {
      equal: () => {
        flush();
        return false;
      },
    });
    expect(() => {
      e$.value = 1;
    }).toThrow("flush during computation");

    setDevMode(false);
    const prod$ = writable(0);
    const prodSpy = vi.fn();
    const stopProd = prod$.subscribe(prodSpy, { immediate: false });
    prod$.value = 1;
    flush();
    expect(prodSpy).toHaveBeenCalledWith(1);
    stopProd();
  });
});
