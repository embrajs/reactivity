import { afterEach, describe, expect, it, vi } from "vitest";
import { batch, computed, reactiveList, watch, writable } from "../../src";
import { type SpyEvent, type SpyLogger, spy } from "../../src/debug";
import { runtime } from "../../src/runtime";
import { setDevMode } from "../setup";

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockLogger(): SpyLogger & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    log: (...args) => calls.push(`log:${args.map(String).join(" ")}`),
    group: (...args) => calls.push(`group:${args.map(String).join(" ")}`),
    groupCollapsed: (...args) => calls.push(`groupCollapsed:${args.map(String).join(" ")}`),
    groupEnd: () => calls.push("groupEnd"),
    trace: () => calls.push("trace"),
    error: (...args) => calls.push(`error:${args.map(String).join(" ")}`),
  };
}

describe("spy", () => {
  it("mounts and unmounts runtime.__dev_spy automatically", () => {
    expect(runtime.__dev_spy).toBeUndefined();
    const stop1 = spy(() => {});
    const stop2 = spy(() => {});
    expect(runtime.__dev_spy).toBeTypeOf("function");

    stop1();
    expect(runtime.__dev_spy).toBeTypeOf("function");
    stop1(); // idempotent cleanup
    expect(runtime.__dev_spy).toBeTypeOf("function");
    stop2();
    expect(runtime.__dev_spy).toBeUndefined();
  });

  it("emits set, compute, effect, subscribe, batch, flush, and dispose events", async () => {
    const events: SpyEvent[] = [];
    const stopSpy = spy((e) => events.push(e));

    const count$ = writable(0, { name: "count" });
    const doubled$ = computed(() => count$.get() * 2, { name: "doubled" });
    const isPositive$ = computed(() => count$.get() > 0, { name: "isPositive" });

    // Computed remains lazy until read
    count$.set(1);
    expect(events.some((e) => e.type === "compute-start")).toBe(false);

    const stopWatch = watch(
      function render() {
        doubled$.get();
        isPositive$.get();
      },
      { sync: true },
    );

    const stopSub = doubled$.subscribe(() => {}, { sync: true, immediate: false });
    const stopAsyncSub = count$.subscribe(() => {}, { immediate: false });

    events.length = 0;
    batch(() => {
      count$.set(2);
      count$.set(2); // unchanged
    });

    expect(events.map((e) => e.type)).toEqual([
      "batch-start",
      "set",
      "set",
      "compute-start",
      "compute-end",
      "subscribe",
      "compute-start",
      "compute-end",
      "effect-start",
      "effect-end",
      "batch-end",
    ]);

    const computeEvents = events.filter((e) => e.type === "compute-end");
    expect(computeEvents[0]).toMatchObject({ prevValue: 2, nextValue: 4, changed: true });
    expect(computeEvents[1]).toMatchObject({ prevValue: true, nextValue: true, changed: false });

    // Async flush
    events.length = 0;
    await Promise.resolve();
    expect(events.map((e) => e.type)).toEqual(["flush-start", "subscribe", "flush-end"]);

    // Collection mutation even without observers
    events.length = 0;
    const list = reactiveList([1]);
    list.push(2);
    list.dispose();
    expect(events.map((e) => e.type)).toEqual(["set", "dispose"]);

    stopSub();
    stopAsyncSub();
    stopWatch();
    doubled$.dispose();
    isPositive$.dispose();
    count$.dispose();
    stopSpy();
  });

  it("emits error details when batch, computed, watch, or async flush throws", async () => {
    const events: SpyEvent[] = [];
    const stopSpy = spy((e) => events.push(e));

    const a$ = writable(0);
    const badComputed$ = computed(() => {
      if (a$.get() > 0) {
        throw new Error("boom-compute");
      }
      return 0;
    });
    expect(badComputed$.get()).toBe(0);
    a$.set(1);
    expect(() => badComputed$.get()).toThrow("boom-compute");
    expect(events.some((e) => e.type === "compute-end" && e.error instanceof Error)).toBe(true);

    expect(() =>
      batch(() => {
        throw new Error("boom-batch");
      }),
    ).toThrow("boom-batch");
    expect(events.some((e) => e.type === "batch-end" && e.error instanceof Error)).toBe(true);

    const b$ = writable(0);
    const stopWatch = watch(() => {
      if (b$.get() > 0) {
        throw new Error("boom-watch");
      }
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on("uncaughtException", onUnhandled);
    b$.set(1);
    await new Promise((r) => setTimeout(r, 10));
    process.off("uncaughtException", onUnhandled);
    expect(unhandled.length).toBe(1);
    expect(events.some((e) => e.type === "effect-end" && e.error instanceof Error)).toBe(true);
    expect(events.some((e) => e.type === "flush-end" && e.error instanceof Error)).toBe(true);

    stopWatch();
    stopSpy();
  });

  it("supports string, RegExp, and predicate filters", () => {
    const a$ = writable(0, { name: "cart.count" });
    const b$ = writable(0, { name: "user.age" });

    const strEvents: SpyEvent[] = [];
    const regEvents: SpyEvent[] = [];
    const fnEvents: SpyEvent[] = [];

    const s1 = spy((e) => strEvents.push(e), { filter: "cart" });
    const s2 = spy((e) => regEvents.push(e), { filter: /^user\./ });
    const s3 = spy((e) => fnEvents.push(e), { filter: (t) => t === a$ });

    a$.set(1);
    b$.set(2);

    expect(strEvents.filter((e) => e.type === "set")).toHaveLength(1);
    expect(regEvents.filter((e) => e.type === "set")).toHaveLength(1);
    expect(fnEvents.filter((e) => e.type === "set")).toHaveLength(1);

    s1();
    s2();
    s3();
  });

  it("supports built-in console mode with cascade and flat modes", async () => {
    const cascadeLogger = createMockLogger();
    const stopCascade = spy({
      cascade: true,
      defaultExpand: false,
      printStack: true,
      logger: cascadeLogger,
    });

    const a$ = writable(0, { name: "a" });
    const b$ = computed(() => (a$.get() > 0 ? 1 : 0), { name: "b" });
    const stopWatch = watch(
      function eff() {
        b$.get();
      },
      { sync: true },
    );
    const stopSub = b$.subscribe(() => {}, { sync: true, immediate: false });
    const stopAsyncSub = a$.subscribe(() => {}, { immediate: false });

    batch(() => {
      a$.set(1);
      a$.set(1);
    });
    // Trigger unchanged compute & async flush
    a$.set(2);
    await Promise.resolve();
    // Direct compute outside batch
    const lazy$ = computed(() => a$.get() + 1);
    expect(lazy$.get()).toBe(3);

    // Default console options (cascade: true, defaultExpand: true, printStack: false)
    const defaultStop = spy({ logger: cascadeLogger });
    a$.set(3);
    defaultStop();

    expect(cascadeLogger.calls.some((c) => c.startsWith("groupCollapsed:[embra] batch"))).toBe(true);
    expect(cascadeLogger.calls.some((c) => c.startsWith("groupCollapsed:[embra] async flush"))).toBe(true);
    expect(cascadeLogger.calls.some((c) => c.includes("triggered by writable(a):"))).toBe(true);
    expect(cascadeLogger.calls.some((c) => c.includes("(unchanged,"))).toBe(true);
    expect(cascadeLogger.calls.some((c) => c.startsWith("trace"))).toBe(true);

    // Error inside cascade (batch-end direct throw, compute-end throw, effect-end throw)
    expect(() =>
      batch(() => {
        throw new Error("direct-batch-err");
      }),
    ).toThrow("direct-batch-err");
    const errNode$ = computed(() => {
      throw new Error("cascade-err");
    });
    expect(() =>
      batch(() => {
        errNode$.get();
      }),
    ).toThrow("cascade-err");
    expect(() =>
      watch(() => {
        throw new Error("cascade-eff-err");
      }),
    ).toThrow("cascade-eff-err");
    expect(cascadeLogger.calls.some((c) => c.startsWith("error:"))).toBe(true);

    stopAsyncSub();
    stopSub();
    stopWatch();
    b$.dispose();
    a$.dispose();
    stopCascade();

    // Flat mode
    const flatLogger = createMockLogger();
    const stopFlat = spy({ cascade: false, printStack: true, logger: flatLogger });
    const x$ = writable(0);
    const y$ = computed(() =>
      x$.get() < 0
        ? (() => {
            throw new Error("flat-err");
          })()
        : x$.get() > 0,
    );
    const stopY = y$.subscribe(() => {}, { sync: true, immediate: false });
    const stopAsyncY = x$.subscribe(() => {}, { immediate: false });
    const stopEff = watch(
      () => {
        if (x$.get() === -2) {
          throw new Error("flat-eff-err");
        }
      },
      { sync: true },
    );
    x$.set(1);
    x$.set(1);
    x$.set(2);
    await Promise.resolve();
    expect(() => {
      x$.set(-1);
      y$.get();
    }).toThrow("flat-err");
    expect(() =>
      watch(() => {
        throw new Error("flat-watch-err");
      }),
    ).toThrow("flat-watch-err");
    stopEff();
    stopAsyncY();
    stopY();
    x$.dispose();
    stopFlat();

    expect(flatLogger.calls.some((c) => c.startsWith("group:"))).toBe(false);
    expect(flatLogger.calls.some((c) => c.includes("set writable:"))).toBe(true);
    expect(flatLogger.calls.some((c) => c.includes("dispose"))).toBe(true);
    expect(flatLogger.calls.some((c) => c.startsWith("error:"))).toBe(true);
  });

  it("warns once globally and returns a no-op in production", () => {
    setDevMode(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const listener = vi.fn();

    const stop1 = spy(listener);
    const stop2 = spy();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(runtime.__dev_spy).toBeUndefined();

    const a$ = writable(0);
    a$.set(1);
    expect(listener).not.toHaveBeenCalled();

    stop1();
    stop2();
  });
});
