import { afterEach, describe, expect, it, vi } from "vitest";
import { writable } from "../src";

async function tick() {
  await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("writable", () => {
  describe("get", () => {
    it.each([undefined, null, false, 0, "", [1, 2], { value: 1 }])("preserves the initial value %j", (value) => {
      const source = writable(value);
      expect(source.get()).toBe(value);
    });

    it("returns the latest value before notifications run", async () => {
      const source = writable(0);
      const spy = vi.fn();
      source.subscribe(spy);

      source.set(1);
      source.set(2);
      expect(source.get()).toBe(2);
      expect(spy.mock.calls).toEqual([[0]]);

      await tick();
      expect(spy.mock.calls).toEqual([[0], [2]]);
    });

    it("allows get and set to be passed without a receiver", () => {
      const source = writable(0);
      const get = source.get;
      const set = source.set;
      set(1);
      expect(get()).toBe(1);
    });

    it("stores function values without calling them", () => {
      const initial = vi.fn();
      const next = vi.fn();
      const source = writable(initial);
      expect(source.get()).toBe(initial);

      source.set(next);
      expect(source.get()).toBe(next);
      expect(initial).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("equality", () => {
    it.each([undefined, null] as const)("skips unchanged values with equal: %s", async (equal) => {
      const source = writable(1, { equal });
      const spy = vi.fn();
      source.subscribe(spy);

      source.set(1);
      source.set(1);
      await tick();
      expect(spy.mock.calls).toEqual([[1]]);
    });

    it("compares objects by reference", async () => {
      const initial = { value: 1 };
      const source = writable(initial);
      const spy = vi.fn();
      source.subscribe(spy);

      source.set(initial);
      await tick();
      expect(spy.mock.calls).toEqual([[initial]]);

      const next = { value: 1 };
      source.set(next);
      await tick();
      expect(source.get()).toBe(next);
      expect(spy.mock.calls).toEqual([[initial], [next]]);
    });

    it("treats repeated NaN writes as changes", () => {
      const source = writable(NaN);
      const spy = vi.fn();
      source.subscribe(spy, { sync: true, immediate: false });

      source.set(NaN);
      source.set(NaN);
      expect(spy.mock.calls).toEqual([[NaN], [NaN]]);
    });

    it("treats signed zeros as equal and retains the stored value", () => {
      const source = writable(0);
      const spy = vi.fn();
      source.subscribe(spy, { sync: true, immediate: false });

      source.set(-0);
      expect(source.get()).toBe(0);
      expect(spy).not.toHaveBeenCalled();
    });

    it("retains the previous value when a custom comparator returns true", async () => {
      const initial = { id: 1, label: "initial" };
      const equal = vi.fn((a: typeof initial, b: typeof initial) => a.id === b.id);
      const source = writable(initial, { equal });
      const spy = vi.fn();
      source.subscribe(spy);

      const ignored = { id: 1, label: "ignored" };
      source.set(ignored);
      expect(source.get()).toBe(initial);

      const next = { id: 2, label: "next" };
      source.set(next);
      await tick();
      expect(source.get()).toBe(next);
      expect(spy.mock.calls).toEqual([[initial], [next]]);
      expect(equal.mock.calls).toEqual([
        [initial, ignored],
        [initial, next],
      ]);
    });

    it("does not commit a write if the comparator throws", () => {
      const error = new Error("equal");
      const source = writable(0, {
        equal(a, b) {
          if (b === 1) throw error;
          return a === b;
        },
      });
      const spy = vi.fn();
      source.subscribe(spy, { sync: true });

      expect(() => source.set(1)).toThrow(error);
      expect(source.get()).toBe(0);
      expect(spy.mock.calls).toEqual([[0]]);

      source.set(2);
      expect(spy.mock.calls).toEqual([[0], [2]]);
    });

    it("notifies on each synchronous write with equal: false", () => {
      const source = writable(0, { equal: false });
      const spy = vi.fn();
      source.subscribe(spy, { sync: true });

      source.set(0);
      source.set(0);
      expect(spy.mock.calls).toEqual([[0], [0], [0]]);
    });

    it("coalesces unchanged asynchronous writes with equal: false", async () => {
      const source = writable(0, { equal: false });
      const spy = vi.fn();
      source.subscribe(spy);

      source.set(0);
      source.set(0);
      await tick();
      expect(spy.mock.calls).toEqual([[0], [0]]);
    });

    it("skips asynchronous updates that return to the observed value", async () => {
      const source = writable(0);
      const spy = vi.fn();
      source.subscribe(spy);

      source.set(1);
      source.set(0);
      await tick();
      expect(spy.mock.calls).toEqual([[0]]);

      source.set(2);
      await tick();
      expect(spy.mock.calls).toEqual([[0], [2]]);
    });

    it("uses custom equality for coalesced updates", async () => {
      const source = writable(0, { equal: (a, b) => a % 10 === b % 10 });
      const spy = vi.fn();
      source.subscribe(spy);

      source.set(11);
      source.set(20);
      await tick();
      expect(source.get()).toBe(20);
      expect(spy.mock.calls).toEqual([[0]]);

      source.set(21);
      await tick();
      expect(spy.mock.calls).toEqual([[0], [21]]);
    });

    it("tracks the observed value separately for each subscription", async () => {
      const source = writable(0);
      const first = vi.fn();
      const second = vi.fn();
      source.subscribe(first);

      source.set(1);
      source.subscribe(second);
      source.set(0);
      await tick();
      expect(first.mock.calls).toEqual([[0]]);
      expect(second.mock.calls).toEqual([[1], [0]]);
    });
  });

  describe("subscribe", () => {
    it("delivers the current value before returning", () => {
      const source = writable(0);
      const calls: (number | string)[] = [];
      source.subscribe((value) => calls.push(value));
      calls.push("returned");
      expect(calls).toEqual([0, "returned"]);
    });

    it.each([false, true])("supports immediate: false with sync: %s", async (sync) => {
      const source = writable(0);
      const spy = vi.fn();
      source.subscribe(spy, { sync, immediate: false });
      expect(spy).not.toHaveBeenCalled();

      source.set(1);
      expect(spy.mock.calls).toEqual(sync ? [[1]] : []);
      await tick();
      expect(spy.mock.calls).toEqual([[1]]);
    });

    it("delivers each synchronous update before set returns", () => {
      const source = writable(0);
      const spy = vi.fn();
      source.subscribe(spy, { sync: true });

      source.set(1);
      expect(spy.mock.calls).toEqual([[0], [1]]);
      source.set(2);
      expect(spy.mock.calls).toEqual([[0], [1], [2]]);
    });

    it("keeps synchronous and asynchronous delivery independent", async () => {
      const source = writable(0);
      const sync = vi.fn();
      const async = vi.fn();
      source.subscribe(sync, { sync: true, immediate: false });
      source.subscribe(async, { immediate: false });

      source.set(1);
      source.set(2);
      expect(sync.mock.calls).toEqual([[1], [2]]);
      expect(async).not.toHaveBeenCalled();

      await tick();
      expect(async.mock.calls).toEqual([[2]]);
    });

    it.each([0, 1, 2])("removes subscription %s without disturbing its neighbors", async (index) => {
      const source = writable(0);
      const spies = [vi.fn(), vi.fn(), vi.fn()];
      const stops = spies.map((spy) => source.subscribe(spy, { immediate: false }));
      stops[index]();
      stops[index]();

      source.set(1);
      await tick();
      for (let i = 0; i < spies.length; i++) {
        expect(spies[i].mock.calls).toEqual(i === index ? [] : [[1]]);
      }
    });

    it("treats repeated subscriptions of the same callback independently", async () => {
      const source = writable(0);
      const spy = vi.fn();
      const stop = source.subscribe(spy, { immediate: false });
      source.subscribe(spy, { immediate: false });

      source.set(1);
      await tick();
      expect(spy.mock.calls).toEqual([[1], [1]]);

      stop();
      source.set(2);
      await tick();
      expect(spy.mock.calls).toEqual([[1], [1], [2]]);
    });

    it("cancels a subscription that is already queued", async () => {
      const source = writable(0);
      const spy = vi.fn();
      const stop = source.subscribe(spy, { immediate: false });

      source.set(1);
      stop();
      source.set(2);
      await tick();
      expect(spy).not.toHaveBeenCalled();
    });

    it("allows a callback to cancel itself", () => {
      const source = writable(0);
      const spy = vi.fn();
      const stop = source.subscribe(
        (value) => {
          spy(value);
          stop();
        },
        { sync: true, immediate: false },
      );

      source.set(1);
      source.set(2);
      expect(spy.mock.calls).toEqual([[1]]);
    });

    it("allows a callback to cancel a later queued subscription", () => {
      const source = writable(0);
      const second = vi.fn();
      const third = vi.fn();
      source.subscribe(() => stopSecond(), { sync: true, immediate: false });
      const stopSecond = source.subscribe(second, { sync: true, immediate: false });
      source.subscribe(third, { sync: true, immediate: false });

      source.set(1);
      source.set(2);
      expect(second).not.toHaveBeenCalled();
      expect(third.mock.calls).toEqual([[1], [2]]);
    });

    it("starts new non-immediate subscriptions with the next update", () => {
      const source = writable(0);
      const calls: string[] = [];
      source.subscribe(
        (value) => {
          calls.push(`first:${value}`);
          if (value === 1) {
            source.subscribe((next) => calls.push(`new:${next}`), { sync: true, immediate: false });
          }
        },
        { sync: true, immediate: false },
      );
      source.subscribe((value) => calls.push(`last:${value}`), { sync: true, immediate: false });

      source.set(1);
      expect(calls).toEqual(["first:1", "last:1"]);
      source.set(2);
      expect(calls).toEqual(["first:1", "last:1", "first:2", "last:2", "new:2"]);
    });

    it("queues reentrant synchronous writes after pending subscriptions", () => {
      const source = writable(0);
      const calls: string[] = [];
      source.subscribe(
        (value) => {
          calls.push(`first:${value}`);
          if (value === 1) source.set(2);
        },
        { sync: true, immediate: false },
      );
      source.subscribe((value) => calls.push(`second:${value}`), { sync: true, immediate: false });

      source.set(1);
      expect(calls).toEqual(["first:1", "second:2", "first:2"]);
    });

    it("drains asynchronous writes made by a running callback", async () => {
      const source = writable(0);
      const calls: number[] = [];
      source.subscribe((value) => {
        calls.push(value);
        if (value === 1) source.set(2);
      });

      source.set(1);
      await tick();
      expect(calls).toEqual([0, 1, 2]);
    });

    it("observes writes made by the initial callback", async () => {
      const source = writable(0);
      const calls: number[] = [];
      source.subscribe((value) => {
        calls.push(value);
        if (value === 0) source.set(1);
      });

      expect(source.get()).toBe(1);
      expect(calls).toEqual([0]);
      await tick();
      expect(calls).toEqual([0, 1]);
    });

    it("unsubscribes if the initial callback throws, including pending work", async () => {
      const source = writable(0);
      const error = new Error("initial callback");
      const spy = vi.fn(() => {
        source.set(1);
        throw error;
      });

      expect(() => source.subscribe(spy)).toThrow(error);
      expect(source.get()).toBe(1);
      const next = vi.fn();
      source.subscribe(next, { immediate: false });
      source.set(2);
      await tick();
      expect(spy).toHaveBeenCalledOnce();
      expect(next.mock.calls).toEqual([[2]]);
    });

    it("drains other synchronous subscriptions before throwing the first error", () => {
      const source = writable(0);
      const firstError = new Error("first");
      const secondError = new Error("second");
      const spy = vi.fn();
      source.subscribe(
        (value) => {
          if (value === 1) throw firstError;
        },
        { sync: true, immediate: false },
      );
      source.subscribe(
        (value) => {
          if (value === 1) throw secondError;
        },
        { sync: true, immediate: false },
      );
      source.subscribe(spy, { sync: true, immediate: false });

      expect(() => source.set(1)).toThrow(firstError);
      expect(source.get()).toBe(1);
      expect(spy.mock.calls).toEqual([[1]]);
      source.set(2);
      expect(spy.mock.calls).toEqual([[1], [2]]);
    });

    it.each([undefined, null, false, 0, ""])("preserves a thrown %j while draining other subscriptions", (error) => {
      const source = writable(0);
      const spy = vi.fn();
      source.subscribe(
        (value) => {
          if (value === 1) throw error;
        },
        { sync: true, immediate: false },
      );
      source.subscribe(
        (value) => {
          if (value === 1) throw new Error("later error");
        },
        { sync: true, immediate: false },
      );
      source.subscribe(spy, { sync: true, immediate: false });

      const noError = Symbol("no error");
      let thrown: unknown = noError;
      try {
        source.set(1);
      } catch (caught) {
        thrown = caught;
      }
      expect(thrown).toBe(error);
      expect(source.get()).toBe(1);
      expect(spy.mock.calls).toEqual([[1]]);

      source.set(2);
      expect(spy.mock.calls).toEqual([[1], [2]]);
    });

    it("restores the asynchronous queue after a callback throws", async () => {
      const source = writable(0);
      const error = new Error("async callback");
      const spy = vi.fn();
      let flush!: VoidFunction;
      vi.spyOn(globalThis, "queueMicrotask").mockImplementationOnce((callback) => {
        flush = callback;
      });
      source.subscribe(
        (value) => {
          if (value === 1) throw error;
        },
        { immediate: false },
      );
      source.subscribe(spy, { immediate: false });

      source.set(1);
      expect(() => flush()).toThrow(error);
      expect(spy.mock.calls).toEqual([[1]]);
      source.set(2);
      await tick();
      expect(spy.mock.calls).toEqual([[1], [2]]);
    });

    it.each([undefined, null, false, 0, ""])("preserves a thrown %j from an asynchronous callback", async (error) => {
      const source = writable(0);
      const spy = vi.fn();
      let flush!: VoidFunction;
      vi.spyOn(globalThis, "queueMicrotask").mockImplementationOnce((callback) => {
        flush = callback;
      });
      source.subscribe(
        (value) => {
          if (value === 1) throw error;
        },
        { immediate: false },
      );
      source.subscribe(
        (value) => {
          if (value === 1) throw new Error("later error");
        },
        { immediate: false },
      );
      source.subscribe(spy, { immediate: false });

      source.set(1);
      const noError = Symbol("no error");
      let thrown: unknown = noError;
      try {
        flush();
      } catch (caught) {
        thrown = caught;
      }
      expect(thrown).toBe(error);
      expect(spy.mock.calls).toEqual([[1]]);

      source.set(2);
      await tick();
      expect(spy.mock.calls).toEqual([[1], [2]]);
    });
  });

  describe("dispose", () => {
    it.each([false, true])("releases cancelled subscription callbacks with queued work: %s", async (queued) => {
      const source = writable(0);
      let stop!: () => void;
      const callback = (() => {
        const callback = () => {};
        stop = source.subscribe(callback, { immediate: false });
        return new WeakRef(callback);
      })();

      if (queued) source.set(1);
      source.dispose();
      stop();
      await new Promise<void>((resolve) => setImmediate(resolve));
      globalThis.gc!();

      expect(callback.deref()).toBeUndefined();
      expect(source.get()).toBe(queued ? 1 : 0);
      expect(() => stop()).not.toThrow();
    });

    it("retains the last value and allows repeated disposal", () => {
      const initial = { value: 0 };
      const next = { value: 1 };
      const source = writable(initial);
      source.set(next);

      source.dispose();
      source.dispose();
      expect(source.get()).toBe(next);
    });

    it("skips queued callbacks after disposal", async () => {
      const source = writable(0);
      const spy = vi.fn();
      const stop = source.subscribe(spy, { immediate: false });

      source.set(1);
      source.dispose();
      await tick();
      expect(spy).not.toHaveBeenCalled();
      expect(() => stop()).not.toThrow();
      expect(() => stop()).not.toThrow();
    });

    it("skips pending callbacks when a synchronous callback disposes the source", () => {
      const source = writable(0);
      const other = writable(0);
      const skipped = vi.fn();
      const next = vi.fn();
      source.subscribe(
        () => {
          source.dispose();
          other.set(1);
        },
        { sync: true, immediate: false },
      );
      source.subscribe(skipped, { sync: true, immediate: false });
      other.subscribe(next, { sync: true, immediate: false });

      source.set(1);
      expect(skipped).not.toHaveBeenCalled();
      expect(next.mock.calls).toEqual([[1]]);
    });

    it("rejects writes in development", () => {
      const source = writable(0);
      vi.spyOn(console, "error").mockImplementation(() => {});
      source.dispose();
      expect(() => source.set(1)).toThrow("disposed");
    });

    it("rejects new subscriptions in development", () => {
      const source = writable(0);
      const spy = vi.fn();
      vi.spyOn(console, "error").mockImplementation(() => {});
      source.dispose();
      expect(() => source.subscribe(spy)).toThrow("disposed");
      expect(spy).not.toHaveBeenCalled();
    });
  });
});

describe("writable.value", () => {
  it("shares the current value with get and set", () => {
    const source = writable(0);
    expect(source.value).toBe(0);

    source.set(1);
    expect(source.value).toBe(1);
    source.value = 2;
    expect(source.get()).toBe(2);
  });

  it("applies equality and notifies through property writes", () => {
    const source = writable(0);
    const spy = vi.fn();
    source.subscribe(spy, { sync: true, immediate: false });

    source.value = 0;
    expect(spy).not.toHaveBeenCalled();
    source.value = 1;
    expect(spy.mock.calls).toEqual([[1]]);
  });

  it("writes undefined through the property", () => {
    const source = writable<number | undefined>(1);
    source.value = undefined;
    expect(source.get()).toBeUndefined();
  });

  it("uses the current setter for property writes", () => {
    const source = writable(0);
    const set = source.set;
    source.set = (value) => set(value * 2);

    source.value = 3;
    expect(source.get()).toBe(6);
  });

  it("retains the last property value after disposal", () => {
    const source = writable(0);
    source.value = 1;
    source.dispose();
    expect(source.value).toBe(1);
  });
});
