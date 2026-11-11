import { afterEach, describe, expect, it, vi } from "vitest";
import * as first from "../src";

vi.resetModules();
const second = await import("../src");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shared runtime", () => {
  it("invalidates computed observers across module copies", () => {
    const source = first.writable(0);
    const compute = vi.fn((input: number) => input + 1);
    const fixed = second.derived(source, compute);
    const dynamic = first.computed(() => fixed.get() + 1);
    expect(dynamic.get()).toBe(2);
    source.set(1);
    expect(dynamic.get()).toBe(3);
    expect(dynamic.get()).toBe(3);
    expect(compute).toHaveBeenCalledTimes(2);

    const seen = vi.fn();
    const stop = dynamic.subscribe(seen, { sync: true });
    stop();
    source.set(2);
    expect(dynamic.get()).toBe(4);
    expect(seen.mock.calls).toEqual([[3]]);
  });

  it("recognizes read-only nodes from another module copy", () => {
    expect(first.writable).not.toBe(second.writable);
    const [firstReadable] = first.readable(0);
    const [secondReadable] = second.readable(0);

    expect(first.isReadable(secondReadable)).toBe(true);
    expect(second.isReadable(firstReadable)).toBe(true);
    expect(first.isWritable(secondReadable)).toBe(false);
    expect(second.isWritable(firstReadable)).toBe(false);
    expect(first.isWritable(second.writable(0))).toBe(true);
    expect(second.isWritable(first.writable(0))).toBe(true);
  });

  it("tracks mixed value chains and restores the outer observer across copies", () => {
    const source = second.writable(1);
    const hidden = first.writable(0);
    const tracked = second.writable(0);
    const dynamic = first.computed(() => source.get() + 1);
    const fixed = second.derived(dynamic, (value) => {
      hidden.get();
      return value * 2;
    });
    const spy = vi.fn();
    const stop = first.watch(
      () => {
        spy(fixed.get(), tracked.get());
      },
      { sync: true },
    );

    source.set(2);
    tracked.set(1);
    hidden.set(1);
    expect(spy.mock.calls).toEqual([
      [4, 0],
      [6, 0],
      [6, 1],
    ]);
    stop();
    fixed.dispose();
    dynamic.dispose();
  });

  it("isolates subscription and cleanup reads across copies", () => {
    const source = first.writable(0);
    const hidden = second.writable(0);
    const tracked = first.writable(0);
    const parent = vi.fn();
    const child = vi.fn();
    const stop = first.watch(
      () => {
        const stopChild = source.subscribe(
          (value) => {
            hidden.get();
            child(value);
          },
          { sync: true },
        );
        parent(tracked.get());
        return () => {
          stopChild();
          hidden.get();
        };
      },
      { sync: true },
    );

    hidden.set(1);
    source.set(1);
    expect(parent.mock.calls).toEqual([[0]]);
    expect(child.mock.calls).toEqual([[0], [1]]);
    tracked.set(1);
    hidden.set(2);
    expect(parent.mock.calls).toEqual([[0], [1]]);
    expect(child.mock.calls).toEqual([[0], [1], [1]]);
    stop();
  });

  it("defers both copies' synchronous queues until the outer batch returns", () => {
    const a = first.writable(0);
    const b = second.writable(0);
    const spy = vi.fn();
    const stopA = a.subscribe((value) => spy("a", value), { sync: true, immediate: false });
    const stopB = b.subscribe((value) => spy("b", value), { sync: true, immediate: false });

    first.batch(() => {
      a.set(1);
      second.batch(() => {
        b.set(1);
        a.set(2);
      });
      b.set(2);
      expect(spy).not.toHaveBeenCalled();
    });
    expect(spy.mock.calls).toEqual([
      ["a", 2],
      ["b", 2],
    ]);
    stopA();
    stopB();
  });

  it("schedules one microtask for both copies' asynchronous queues", async () => {
    const schedule = vi.spyOn(globalThis, "queueMicrotask");
    const a = first.writable(0);
    const b = second.writable(0);
    const spy = vi.fn();
    const stopA = a.subscribe((value) => spy("a", value), { immediate: false });
    const stopB = b.subscribe((value) => spy("b", value), { immediate: false });

    a.set(1);
    b.set(1);
    a.set(2);
    b.set(2);
    expect(schedule).toHaveBeenCalledOnce();
    expect(spy).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(spy.mock.calls).toEqual([
      ["a", 2],
      ["b", 2],
    ]);
    stopA();
    stopB();
  });

  it("restores shared scheduling after an error and explicit graph disposal", () => {
    const a = first.writable(0);
    const b = second.writable(0);
    const error = new Error("callback");
    const spy = vi.fn();
    const stopA = a.subscribe(
      (value) => {
        if (value === 1) throw error;
        spy("a", value);
      },
      { sync: true, immediate: false },
    );
    const stopB = b.subscribe((value) => spy("b", value), { sync: true, immediate: false });

    expect(() =>
      second.batch(() => {
        a.set(1);
        b.set(1);
      }),
    ).toThrow(error);
    expect(spy).not.toHaveBeenCalled();
    stopA();
    stopB();
    a.dispose();
    b.dispose();
    const nextA = first.writable(0);
    const nextB = second.writable(0);
    const stopNextA = nextA.subscribe((value) => spy("a", value), { sync: true, immediate: false });
    const stopNextB = nextB.subscribe((value) => spy("b", value), { sync: true, immediate: false });
    first.batch(() => {
      nextA.set(2);
      nextB.set(2);
    });
    expect(spy.mock.calls).toEqual([
      ["a", 2],
      ["b", 2],
    ]);
    stopNextA();
    stopNextB();
  });
});
