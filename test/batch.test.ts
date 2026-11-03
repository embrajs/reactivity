import { describe, expect, it, vi } from "vitest";
import { batch, watch, writable } from "../src/reactivity";

describe("batch", () => {
  it("returns the callback result and calls it once", () => {
    const value = { result: 1 };
    const callback = vi.fn(() => value);

    expect(batch(callback)).toBe(value);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("updates values immediately and defers synchronous subscriptions until it returns", () => {
    const source = writable(0);
    const spy = vi.fn();
    source.subscribe(spy, { sync: true, immediate: false });

    batch(() => {
      source.set(1);
      source.set(2);
      expect(source.get()).toBe(2);
      expect(spy).not.toHaveBeenCalled();
    });
    expect(spy.mock.calls).toEqual([[2]]);
  });

  it("reruns a synchronous watch once for changes to multiple dependencies", () => {
    const first = writable(0);
    const second = writable(0);
    const spy = vi.fn();
    const stop = watch(
      () => {
        spy(first.get(), second.get());
      },
      { sync: true },
    );

    batch(() => {
      first.set(1);
      second.set(2);
      first.set(3);
      expect(spy.mock.calls).toEqual([[0, 0]]);
    });
    expect(spy.mock.calls).toEqual([
      [0, 0],
      [3, 2],
    ]);
    stop();
  });

  it("flushes only when the outermost batch returns", () => {
    const source = writable(0);
    const spy = vi.fn();
    source.subscribe(spy, { sync: true, immediate: false });

    batch(() => {
      source.set(1);
      expect(
        batch(() => {
          source.set(2);
          return "nested";
        }),
      ).toBe("nested");
      expect(spy).not.toHaveBeenCalled();
      source.set(3);
    });
    expect(spy.mock.calls).toEqual([[3]]);
  });

  it("skips reverted changes without running cleanup", () => {
    const source = writable(0);
    const spy = vi.fn();
    const cleanup = vi.fn();
    const stop = watch(
      () => {
        spy(source.get());
        return cleanup;
      },
      { sync: true },
    );

    batch(() => {
      source.set(1);
      source.set(0);
    });
    expect(spy.mock.calls).toEqual([[0]]);
    expect(cleanup).not.toHaveBeenCalled();
    stop();
  });

  it("delivers repeated values once when equality is disabled", () => {
    const source = writable(0, { equal: false });
    const spy = vi.fn();
    source.subscribe(spy, { sync: true, immediate: false });

    batch(() => {
      source.set(0);
      source.set(0);
    });
    expect(spy.mock.calls).toEqual([[0]]);
  });

  it("uses custom equality when checking the final value", () => {
    const source = writable(0, { equal: (a, b) => a % 10 === b % 10 });
    const spy = vi.fn();
    source.subscribe(spy, { sync: true, immediate: false });

    batch(() => {
      source.set(11);
      source.set(20);
    });
    expect(source.get()).toBe(20);
    expect(spy).not.toHaveBeenCalled();
    source.set(21);
    expect(spy.mock.calls).toEqual([[21]]);
  });

  it("leaves asynchronous subscriptions to the microtask queue", async () => {
    const source = writable(0);
    const sync = vi.fn();
    const async = vi.fn();
    source.subscribe(sync, { sync: true, immediate: false });
    source.subscribe(async, { immediate: false });

    batch(() => {
      source.set(1);
      source.set(2);
    });
    expect(sync.mock.calls).toEqual([[2]]);
    expect(async).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(async.mock.calls).toEqual([[2]]);
  });

  it("does not recursively flush from a running subscription", () => {
    const source = writable(0);
    const other = writable(0);
    const calls: string[] = [];
    source.subscribe(
      () => {
        calls.push("start");
        batch(() => {
          other.set(1);
          other.set(2);
        });
        calls.push("end");
      },
      { sync: true, immediate: false },
    );
    other.subscribe((value) => calls.push(`other:${value}`), { sync: true, immediate: false });

    source.set(1);
    expect(calls).toEqual(["start", "end", "other:2"]);
  });

  it("runs newly created watches immediately without ending the batch", () => {
    const source = writable(0);
    const existing = vi.fn();
    const created = vi.fn();
    const stopExisting = watch(
      () => {
        existing(source.get());
      },
      { sync: true },
    );

    const stopCreated = batch(() => {
      source.set(1);
      const stop = watch(
        () => {
          created(source.get());
        },
        { sync: true },
      );
      expect(created.mock.calls).toEqual([[1]]);
      expect(existing.mock.calls).toEqual([[0]]);
      source.set(2);
      expect(created.mock.calls).toEqual([[1]]);
      return stop;
    });
    expect(existing.mock.calls).toEqual([[0], [2]]);
    expect(created.mock.calls).toEqual([[1], [2]]);
    stopCreated();
    stopExisting();
  });

  it("delivers the current value immediately to subscriptions created inside a batch", () => {
    const source = writable(0);
    const spy = vi.fn();

    const stop = batch(() => {
      source.set(1);
      const stop = source.subscribe(spy, { sync: true });
      expect(spy.mock.calls).toEqual([[1]]);
      source.set(2);
      expect(spy.mock.calls).toEqual([[1]]);
      return stop;
    });
    expect(spy.mock.calls).toEqual([[1], [2]]);
    stop();
  });

  it("preserves dependency tracking inside a watch", () => {
    const source = writable(0);
    const spy = vi.fn();
    const stop = watch(
      () => {
        spy(batch(() => source.get()));
      },
      { sync: true },
    );

    source.set(1);
    expect(spy.mock.calls).toEqual([[0], [1]]);
    stop();
  });

  it("skips subscriptions cancelled before the batch returns", () => {
    const source = writable(0);
    const spy = vi.fn();
    const stop = source.subscribe(spy, { sync: true, immediate: false });

    batch(() => {
      source.set(1);
      stop();
      source.set(2);
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("ends before an asynchronous callback resumes", async () => {
    const source = writable(0);
    const spy = vi.fn();
    source.subscribe(spy, { sync: true, immediate: false });

    const result = batch(async () => {
      source.set(1);
      expect(spy).not.toHaveBeenCalled();
      await Promise.resolve();
      source.set(2);
      expect(spy.mock.calls).toEqual([[1], [2]]);
      return "done";
    });
    expect(spy.mock.calls).toEqual([[1]]);
    expect(await result).toBe("done");
  });

  describe("errors", () => {
    it.each([
      new Error("batch"),
      undefined,
      null,
      false,
      0,
      "",
    ])("preserves the callback's thrown %j while draining synchronous notifications", (error) => {
      const source = writable(0);
      const peer = vi.fn();
      source.subscribe(
        (value) => {
          if (value === 1) throw new Error("notification");
        },
        { sync: true, immediate: false },
      );
      source.subscribe(peer, { sync: true, immediate: false });

      const noError = Symbol("no error");
      let thrown: unknown = noError;
      try {
        batch(() => {
          source.set(1);
          throw error;
        });
      } catch (caught) {
        thrown = caught;
      }
      expect(thrown).toBe(error);
      expect(source.get()).toBe(1);
      expect(peer.mock.calls).toEqual([[1]]);
      source.set(2);
      expect(peer.mock.calls).toEqual([[1], [2]]);
    });

    it("propagates a notification error after draining the remaining subscriptions", () => {
      const source = writable(0);
      const error = new Error("notification");
      const peer = vi.fn();
      source.subscribe(
        (value) => {
          if (value === 1) throw error;
        },
        { sync: true, immediate: false },
      );
      source.subscribe(peer, { sync: true, immediate: false });

      expect(() => batch(() => source.set(1))).toThrow(error);
      expect(peer.mock.calls).toEqual([[1]]);
      source.set(2);
      expect(peer.mock.calls).toEqual([[1], [2]]);
    });

    it("keeps an outer batch active when it catches a nested batch error", () => {
      const source = writable(0);
      const error = new Error("nested");
      const spy = vi.fn();
      source.subscribe(spy, { sync: true, immediate: false });

      batch(() => {
        source.set(1);
        expect(() =>
          batch(() => {
            source.set(2);
            throw error;
          }),
        ).toThrow(error);
        expect(spy).not.toHaveBeenCalled();
        source.set(3);
      });
      expect(spy.mock.calls).toEqual([[3]]);
    });

    it("allows a watch to recover after cleanup fails at the end of a batch", () => {
      const source = writable(0);
      const error = new Error("cleanup");
      const spy = vi.fn();
      const cleanup = vi.fn(() => {
        throw error;
      });
      const stop = watch(
        () => {
          const value = source.get();
          spy(value);
          if (value === 0) return cleanup;
        },
        { sync: true },
      );

      expect(() => batch(() => source.set(1))).toThrow(error);
      expect(spy.mock.calls).toEqual([[0]]);
      expect(cleanup).toHaveBeenCalledOnce();
      batch(() => source.set(2));
      expect(spy.mock.calls).toEqual([[0], [2]]);
      expect(cleanup).toHaveBeenCalledOnce();
      stop();
    });
  });
});
