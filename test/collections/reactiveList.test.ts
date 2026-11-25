import { afterEach, describe, expect, it, vi } from "vitest";
import { batch, computed, derived, reactiveList, watch } from "../../src";
import { setDevMode } from "../setup";

afterEach(() => {
  vi.restoreAllMocks();
});

function setup<V>(values: V[]) {
  const list = reactiveList(values);
  const notify = vi.fn();
  list.$.subscribe(notify, { sync: true, immediate: false });
  const disposed: V[] = [];
  list.onDisposeValue((v) => disposed.push(v));
  return { list, notify, disposed };
}

describe("ReactiveList", () => {
  it("creates an empty list or populates initial values", () => {
    expect(reactiveList().length).toBe(0);
    expect(reactiveList(null).length).toBe(0);
    const list = reactiveList(new Set([1, 2, 3]));
    expect(list.length).toBe(3);
    expect(list.get(1)).toBe(2);
    expect(list.array).toEqual([1, 2, 3]);
    expect([...list]).toEqual([1, 2, 3]);
  });

  it("tracks length, get, array, and iteration", () => {
    const list = reactiveList([10, 20]);
    const len = computed(() => list.length);
    const first = computed(() => list.get(0));
    const sum = computed(() => list.array.reduce((a, b) => a + b, 0));
    const joined = computed(() => [...list].join("-"));
    const fixed = derived(list.$, (a) => a.length);
    const watched: number[] = [];
    const stop = watch(() => void watched.push(list.length), { sync: true });

    expect([len.get(), first.get(), sum.get(), joined.get(), fixed.get()]).toEqual([2, 10, 30, "10-20", 2]);

    list.push(30);
    expect([len.get(), first.get(), sum.get(), joined.get(), fixed.get()]).toEqual([3, 10, 60, "10-20-30", 3]);
    expect(watched).toEqual([2, 3]);

    list.set(0, 5);
    expect([first.get(), sum.get()]).toEqual([5, 55]);

    stop();
  });

  it("set overwrites existing indices only", () => {
    const { list, notify, disposed } = setup([1, 2]);
    list.set(0, 1);
    list.set(-1, 9);
    list.set(2, 9);
    expect(notify).not.toHaveBeenCalled();

    list.set(1, 3);
    expect(list.array).toEqual([1, 3]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(disposed).toEqual([2]);
  });

  it("push, pop, shift, unshift", () => {
    const { list, notify, disposed } = setup<number>([]);
    expect(list.push()).toBe(0);
    expect(list.pop()).toBeUndefined();
    expect(list.shift()).toBeUndefined();
    expect(list.unshift()).toBe(0);
    expect(notify).not.toHaveBeenCalled();

    expect(list.push(2, 3)).toBe(2);
    expect(list.unshift(1)).toBe(3);
    expect(list.array).toEqual([1, 2, 3]);
    expect(list.pop()).toBe(3);
    expect(list.shift()).toBe(1);
    expect(list.array).toEqual([2]);
    expect(notify).toHaveBeenCalledTimes(4);
    expect(disposed).toEqual([3, 1]);
  });

  it("splice, clear", () => {
    const { list, notify, disposed } = setup([1, 2, 3, 4]);
    expect(list.splice(1, 0)).toEqual([]);
    expect(notify).not.toHaveBeenCalled();

    expect(list.splice(1, 1, 5, 6)).toEqual([2]);
    expect(list.array).toEqual([1, 5, 6, 3, 4]);
    expect(list.splice(3)).toEqual([3, 4]);
    expect(disposed).toEqual([2, 3, 4]);

    list.clear();
    expect(list.length).toBe(0);
    expect(disposed).toEqual([2, 3, 4, 1, 5, 6]);
    expect(notify).toHaveBeenCalledTimes(3);

    list.clear();
    expect(notify).toHaveBeenCalledTimes(3);
  });

  it("sort, reverse", () => {
    const { list, notify, disposed } = setup([3, 1, 2]);
    list.sort((a, b) => a - b);
    expect(list.array).toEqual([1, 2, 3]);
    list.reverse();
    expect(list.array).toEqual([3, 2, 1]);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(disposed).toEqual([]);

    const single = setup([1]);
    single.list.sort();
    single.list.reverse();
    expect(single.notify).not.toHaveBeenCalled();
  });

  it("replace only notifies on change and keeps retained values", () => {
    const { list, notify, disposed } = setup([1, 2, 3]);
    list.replace([1, 2, 3]);
    expect(notify).not.toHaveBeenCalled();

    list.replace([3, 1]);
    expect(list.array).toEqual([3, 1]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(disposed).toEqual([2]);

    list.replace([3, 1, 4]);
    expect(disposed).toEqual([2]);
  });

  it("cancels disposal when a value is re-inserted in the same batch", () => {
    const { list, notify, disposed } = setup([1, 2]);
    batch(() => {
      const last = list.pop()!;
      const first = list.shift()!;
      list.push(last);
      list.unshift(first);
    });
    expect(list.array).toEqual([1, 2]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(disposed).toEqual([]);
  });

  it("disposes remaining values and rejects dev writes", () => {
    setDevMode(true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { list, disposed } = setup([10, 20]);

    list.dispose();
    const disposedAt = (list as { __dev_disposed_at?: Error }).__dev_disposed_at;
    expect(disposedAt).toBeInstanceOf(Error);
    list.dispose();
    expect((list as { __dev_disposed_at?: Error }).__dev_disposed_at).toBe(disposedAt);
    expect(disposed).toEqual([10, 20]);

    expect(() => list.push(30)).toThrow("disposed");
    expect(() => list.pop()).toThrow("disposed");
    expect(() => list.shift()).toThrow("disposed");
    expect(() => list.unshift(30)).toThrow("disposed");
    expect(consoleError).toHaveBeenCalledWith("ReactiveList disposed at:", disposedAt);
  });

  it("supports all mutators and disposal in production mode without dev diagnostics", () => {
    setDevMode(false);
    const list = reactiveList([3, 1, 2]);
    list.set(0, 4);
    list.push(5);
    expect(list.pop()).toBe(5);
    expect(list.shift()).toBe(4);
    list.unshift(0);
    list.sort((a, b) => a - b);
    list.reverse();
    list.splice(1, 1, 9);
    list.replace([7, 8]);
    expect(list.array).toEqual([7, 8]);

    list.dispose();
    list.push(1);
    expect(list.array).toEqual([7, 8, 1]);

    const prodList = reactiveList([1]);
    prodList.dispose();
    setDevMode(true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => prodList.push(2)).toThrow("disposed");
    expect(consoleError).not.toHaveBeenCalled();
  });
});
