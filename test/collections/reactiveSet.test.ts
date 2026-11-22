import { afterEach, describe, expect, it, vi } from "vitest";
import { batch, computed, derived, reactiveSet, watch } from "../../src";
import { setDevMode } from "../setup";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReactiveSet", () => {
  describe("constructor", () => {
    it("creates an empty set or populates initial values", () => {
      expect(reactiveSet().size).toBe(0);
      expect(reactiveSet(null).size).toBe(0);
      const set = reactiveSet([1, 2, 3]);
      expect(set.size).toBe(3);
      expect(set.has(1)).toBe(true);
      expect(set.has(2)).toBe(true);
      expect(set.has(3)).toBe(true);
      expect(set.has(4)).toBe(false);
    });
  });

  describe("automatic reactive tracking", () => {
    it("tracks has, size, and iterators in computed and watch", () => {
      const set = reactiveSet<number>([1]);
      const hasComputed = computed(() => set.has(2));
      const sizeComputed = computed(() => set.size);
      const keysComputed = computed(() => [...set.keys()].join(","));
      const valuesComputed = computed(() => [...set.values()].reduce((s, n) => s + n, 0));
      const entriesComputed = computed(() => [...set.entries()].map(([a, b]) => `${a}:${b}`).join(","));
      const iterComputed = computed(() => [...set].join(","));
      const forEachComputed = computed(() => {
        let sum = 0;
        set.forEach((v) => {
          sum += v;
        });
        return sum;
      });
      const staticDerived = derived(set.$, (s) => s.size);

      expect(hasComputed.get()).toBe(false);
      expect(sizeComputed.get()).toBe(1);
      expect(keysComputed.get()).toBe("1");
      expect(valuesComputed.get()).toBe(1);
      expect(entriesComputed.get()).toBe("1:1");
      expect(iterComputed.get()).toBe("1");
      expect(forEachComputed.get()).toBe(1);
      expect(staticDerived.get()).toBe(1);

      const watched: number[] = [];
      const stopWatch = watch(
        () => {
          watched.push(set.size);
        },
        { sync: true },
      );
      expect(watched).toEqual([1]);

      set.add(2);
      expect(hasComputed.get()).toBe(true);
      expect(sizeComputed.get()).toBe(2);
      expect(keysComputed.get()).toBe("1,2");
      expect(valuesComputed.get()).toBe(3);
      expect(entriesComputed.get()).toBe("1:1,2:2");
      expect(iterComputed.get()).toBe("1,2");
      expect(forEachComputed.get()).toBe(3);
      expect(staticDerived.get()).toBe(2);
      expect(watched).toEqual([1, 2]);

      stopWatch();
      hasComputed.dispose();
      sizeComputed.dispose();
      keysComputed.dispose();
      valuesComputed.dispose();
      entriesComputed.dispose();
      iterComputed.dispose();
      forEachComputed.dispose();
      staticDerived.dispose();
      set.dispose();
    });
  });

  describe("add, delete, clear, replace", () => {
    it("notifies on add and ignores duplicate values", () => {
      const set = reactiveSet<number>();
      const notifySpy = vi.fn();
      set.$.subscribe(notifySpy, { sync: true, immediate: false });
      const changed: number[][] = [];
      set.onChanged((vals) => changed.push([...vals]));
      const disposed: number[] = [];
      set.onDisposeValue((v) => disposed.push(v));

      set.add(1);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(changed).toEqual([[1]]);
      expect(disposed).toEqual([]);

      set.add(1);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(changed).toEqual([[1]]);

      batch(() => {
        set.add(2);
        set.add(3);
        set.add(2);
      });
      expect(notifySpy).toHaveBeenCalledTimes(2);
      expect(changed).toEqual([[1], [2, 3]]);
      expect(disposed).toEqual([]);
    });

    it("notifies and disposes on delete and clear", () => {
      const set = reactiveSet<number>([1, 2, 3]);
      const notifySpy = vi.fn();
      set.$.subscribe(notifySpy, { sync: true, immediate: false });
      const changed: number[][] = [];
      set.onChanged((vals) => changed.push([...vals]));
      const disposed: number[] = [];
      set.onDisposeValue((v) => disposed.push(v));

      expect(set.delete(99)).toBe(false);
      expect(notifySpy).not.toHaveBeenCalled();

      expect(set.delete(1)).toBe(true);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(changed).toEqual([[1]]);
      expect(disposed).toEqual([1]);

      set.clear();
      expect(set.size).toBe(0);
      expect(notifySpy).toHaveBeenCalledTimes(2);
      expect(changed).toEqual([[1], [2, 3]]);
      expect(disposed).toEqual([1, 2, 3]);

      set.clear();
      expect(notifySpy).toHaveBeenCalledTimes(2);
    });

    it("replaces set values and only notifies on actual differences", () => {
      const set = reactiveSet<number>([1, 2]);
      const notifySpy = vi.fn();
      set.$.subscribe(notifySpy, { sync: true, immediate: false });
      const changed: number[][] = [];
      set.onChanged((vals) => changed.push([...vals]));
      const disposed: number[] = [];
      set.onDisposeValue((v) => disposed.push(v));

      set.replace([2, 1]);
      expect(notifySpy).not.toHaveBeenCalled();
      expect(changed).toEqual([]);
      expect(disposed).toEqual([]);

      set.replace([2, 3]);
      expect([...set]).toEqual([2, 3]);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(changed).toEqual([[3, 1]]);
      expect(disposed).toEqual([1]);

      const empty = reactiveSet<number>();
      empty.replace([4, 5]);
      expect([...empty]).toEqual([4, 5]);
    });
  });

  describe("onChanged and onDisposeValue", () => {
    it("syncs a target set and cancels disposal when re-added in the same batch", () => {
      const source = reactiveSet<number>([1, 2]);
      const target = reactiveSet<number>([1, 2]);
      const disposed: number[] = [];
      source.onDisposeValue((v) => disposed.push(v));

      source.onChanged((values) => {
        for (const v of values) {
          if (source.has(v)) {
            target.add(v);
          } else {
            target.delete(v);
          }
        }
      });

      batch(() => {
        source.delete(1);
        source.add(1);
        source.delete(2);
        source.add(3);
      });

      expect([...target]).toEqual([1, 3]);
      expect(disposed).toEqual([2]);
    });
  });

  describe("dispose & diagnostics", () => {
    it("disposes remaining values and rejects dev writes", () => {
      setDevMode(true);
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const set = reactiveSet([1, 2]);
      const disposed: number[] = [];
      set.onDisposeValue((v) => disposed.push(v));

      set.dispose();
      const firstDisposedAt = (set as { __dev_disposed_at?: Error }).__dev_disposed_at;
      expect(firstDisposedAt).toBeInstanceOf(Error);
      set.dispose();
      expect((set as { __dev_disposed_at?: Error }).__dev_disposed_at).toBe(firstDisposedAt);
      expect(disposed).toEqual([1, 2]);

      expect(() => set.add(3)).toThrow("disposed");
      expect(consoleError).toHaveBeenCalledWith("ReactiveSet disposed at:", firstDisposedAt);
    });
  });
});
