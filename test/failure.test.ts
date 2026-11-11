import { afterEach, describe, expect, it, vi } from "vitest";
import { batch, computed, derived, type EqualityConfig, type Owned, type Readable, watch, writable } from "../src";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("failure boundaries", () => {
  it.each([false, true])("discards pending notifications when a batch body throws, sync=%s", async (sync) => {
    const source = writable(0);
    const callback = vi.fn();
    const stop = source.subscribe(callback, { sync, immediate: false });
    const error = new Error("batch");
    expect(() =>
      batch(() => {
        source.set(1);
        throw error;
      }),
    ).toThrow(error);
    await Promise.resolve();
    expect(source.get()).toBe(1);
    expect(callback).not.toHaveBeenCalled();
    stop();
    source.dispose();
    const fresh = writable(0);
    const next = vi.fn();
    const stopNext = fresh.subscribe(next, { sync, immediate: false });
    fresh.set(2);
    await Promise.resolve();
    expect(next.mock.calls).toEqual([[2]]);
    stopNext();
  });

  it.each([false, true])("aborts a queue at the first error and permits a fresh graph, sync=%s", async (sync) => {
    const source = writable(0);
    const callback = vi.fn();
    const error = new Error("callback");
    let flush!: VoidFunction;
    if (!sync) {
      vi.spyOn(globalThis, "queueMicrotask").mockImplementationOnce((fn) => {
        flush = fn;
      });
    }
    const stopFirst = source.subscribe(
      () => {
        throw error;
      },
      { sync, immediate: false },
    );
    const stopSecond = source.subscribe(callback, { sync, immediate: false });
    if (sync) {
      expect(() => source.set(1)).toThrow(error);
    } else {
      source.set(1);
      expect(() => flush()).toThrow(error);
    }
    expect(callback).not.toHaveBeenCalled();
    stopFirst();
    stopSecond();
    source.dispose();
    const fresh = writable(0);
    const stopFresh = fresh.subscribe(callback, { sync, immediate: false });
    fresh.set(2);
    await Promise.resolve();
    expect(callback.mock.calls).toEqual([[2]]);
    stopFresh();
  });

  it("keeps a caught nested batch inside the outer scheduling boundary", () => {
    const source = writable(0);
    const callback = vi.fn();
    const stop = source.subscribe(callback, { sync: true, immediate: false });
    batch(() => {
      expect(() =>
        batch(() => {
          source.set(1);
          throw new Error("nested");
        }),
      ).toThrow("nested");
      source.set(2);
      expect(callback).not.toHaveBeenCalled();
    });
    expect(callback.mock.calls).toEqual([[2]]);
    stop();
  });

  it("releases a failed initial callback and cancels its writes", async () => {
    const source = writable(0);
    const error = new Error("initial");
    const ref = (() => {
      const callback = () => {
        source.set(1);
        throw error;
      };
      expect(() => watch(callback, { sync: true })).toThrow(error);
      return new WeakRef(callback);
    })();
    await new Promise<void>((resolve) => setImmediate(resolve));
    globalThis.gc!();
    expect(ref.deref()).toBeUndefined();
    expect(source.get()).toBe(1);
  });

  it("does not repeat a throwing cleanup when stopped again", () => {
    const source = writable(0);
    const cleanup = vi.fn(() => {
      throw new Error("cleanup");
    });
    const stop = watch(() => {
      source.get();
      return cleanup;
    });
    expect(stop).toThrow("cleanup");
    expect(stop).not.toThrow();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("retains a source broadcast completed before a Watch cleanup throws", () => {
    const source = writable(0);
    const callback = vi.fn();
    const stopFirst = watch(
      () => {
        source.get();
        return () => {
          throw new Error("cleanup");
        };
      },
      { sync: true },
    );
    const stopSecond = source.subscribe(callback, { sync: true, immediate: false });
    expect(() => source.set(1)).toThrow("cleanup");
    expect(callback.mock.calls).toEqual([[1]]);
    stopFirst();
    stopSecond();
    source.dispose();
  });
});

const factories = [
  {
    name: "computed",
    create: (source: Readable<number>, fn: (value: number) => number, equal?: EqualityConfig<number>) =>
      computed(() => fn(source.get()), { equal }),
  },
  {
    name: "derived",
    create: (source: Readable<number>, fn: (value: number) => number, equal?: EqualityConfig<number>) =>
      derived(source, fn, { equal }),
  },
];

describe.each(factories)("$name failures", ({ create }) => {
  it.each([
    "computation",
    "equality",
  ])("preserves the published output and supports explicit rebuilding after %s fails", (kind) => {
    const source = writable(0);
    const error = new Error(kind);
    let failed = false;
    const build = () =>
      create(
        source,
        (value) => {
          if (failed && kind === "computation") {
            throw error;
          }
          return value * 2;
        },
        (a, b) => {
          if (failed && kind === "equality") {
            throw error;
          }
          return a === b;
        },
      );
    const input = build();
    const output = computed(() => input.get() + 1);
    const callback = vi.fn();
    const stop = output.subscribe(callback, { sync: true });
    failed = true;
    expect(() => source.set(1)).toThrow(error);
    expect(callback.mock.calls).toEqual([[1]]);
    stop();
    output.dispose();
    input.dispose();
    expect(input.get()).toBe(0);
    const frozen = derived(input, (value) => value + 10);
    expect(frozen.get()).toBe(10);
    failed = false;
    const fresh = build();
    const stopFresh = fresh.subscribe(callback, { sync: true });
    source.set(2);
    expect(callback.mock.calls).toEqual([[1], [2], [4]]);
    expect(frozen.get()).toBe(10);
    stopFresh();
    fresh.dispose();
    frozen.dispose();
    source.dispose();
  });

  it("detects a cycle and permits explicit disposal", () => {
    const source = writable(0);
    let node: Owned<Readable<number>>;
    node = create(source, () => node.get());
    expect(() => node.get()).toThrow("loop detected");
    node.dispose();
    expect(() => source.set(1)).not.toThrow();
    const fresh = create(source, (value) => value + 1);
    expect(fresh.get()).toBe(2);
    fresh.dispose();
  });
});
