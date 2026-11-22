import { afterEach, describe, expect, it, vi } from "vitest";
import { batch, computed, derived, reactiveMap, watch } from "../../src";
import { setDevMode } from "../setup";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReactiveMap", () => {
  describe("constructor", () => {
    it("creates an empty map", () => {
      const map = reactiveMap<string, number>();
      expect(map.size).toBe(0);
      expect(reactiveMap(null).size).toBe(0);
    });

    it("creates a map with initial entries", () => {
      const map = reactiveMap([
        ["foo", 1],
        ["bar", 2],
      ]);
      expect(map.size).toBe(2);
      expect(map.get("foo")).toBe(1);
      expect(map.get("bar")).toBe(2);
    });
  });

  describe("automatic reactive tracking", () => {
    it("tracks get, has, size, and iterators in computed and watch", () => {
      const map = reactiveMap<string, number>([["a", 1]]);
      const getComputed = computed(() => map.get("a") ?? 0);
      const hasComputed = computed(() => map.has("b"));
      const sizeComputed = computed(() => map.size);
      const keysComputed = computed(() => [...map.keys()].join(","));
      const valuesComputed = computed(() => [...map.values()].reduce((s, n) => s + n, 0));
      const entriesComputed = computed(() => [...map.entries()].map(([k, v]) => `${k}:${v}`).join(","));
      const iterComputed = computed(() => {
        const out: string[] = [];
        for (const [k, v] of map) {
          out.push(`${k}=${v}`);
        }
        return out.join(",");
      });
      const forEachComputed = computed(() => {
        let sum = 0;
        map.forEach((v) => {
          sum += v;
        });
        return sum;
      });
      const staticDerived = derived(map.$, (m) => m.get("a"));

      expect(getComputed.get()).toBe(1);
      expect(hasComputed.get()).toBe(false);
      expect(sizeComputed.get()).toBe(1);
      expect(keysComputed.get()).toBe("a");
      expect(valuesComputed.get()).toBe(1);
      expect(entriesComputed.get()).toBe("a:1");
      expect(iterComputed.get()).toBe("a=1");
      expect(forEachComputed.get()).toBe(1);
      expect(staticDerived.get()).toBe(1);

      const watched: number[] = [];
      const stopWatch = watch(
        () => {
          watched.push(map.get("a") ?? -1);
        },
        { sync: true },
      );
      expect(watched).toEqual([1]);

      map.set("a", 10);
      expect(getComputed.get()).toBe(10);
      expect(valuesComputed.get()).toBe(10);
      expect(entriesComputed.get()).toBe("a:10");
      expect(iterComputed.get()).toBe("a=10");
      expect(forEachComputed.get()).toBe(10);
      expect(staticDerived.get()).toBe(10);
      expect(watched).toEqual([1, 10]);

      map.set("b", 20);
      expect(hasComputed.get()).toBe(true);
      expect(sizeComputed.get()).toBe(2);
      expect(keysComputed.get()).toBe("a,b");
      expect(valuesComputed.get()).toBe(30);

      stopWatch();
      getComputed.dispose();
      hasComputed.dispose();
      sizeComputed.dispose();
      keysComputed.dispose();
      valuesComputed.dispose();
      entriesComputed.dispose();
      iterComputed.dispose();
      forEachComputed.dispose();
      staticDerived.dispose();
      map.dispose();
    });
  });

  describe("set", () => {
    it("sets and updates values and notifies subscribers", () => {
      const map = reactiveMap<string, number>();
      const notifySpy = vi.fn();
      map.$.subscribe(notifySpy, { sync: true, immediate: false });

      const changedKeys: string[][] = [];
      map.onChanged((keys) => changedKeys.push([...keys]));

      const disposedValues: number[] = [];
      map.onDisposeValue((v) => disposedValues.push(v));

      map.set("foo", 1);
      expect(map.get("foo")).toBe(1);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(notifySpy).toHaveBeenCalledWith(map);
      expect(changedKeys).toEqual([["foo"]]);
      expect(disposedValues).toEqual([]);

      // Setting the same value does not notify
      map.set("foo", 1);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(changedKeys).toEqual([["foo"]]);
      expect(disposedValues).toEqual([]);

      // Updating an existing value disposes the old value
      map.set("foo", 2);
      expect(map.get("foo")).toBe(2);
      expect(notifySpy).toHaveBeenCalledTimes(2);
      expect(changedKeys).toEqual([["foo"], ["foo"]]);
      expect(disposedValues).toEqual([1]);
    });

    it("coalesces multiple sets in a batch", () => {
      const map = reactiveMap<string, number>();
      const notifySpy = vi.fn();
      map.$.subscribe(notifySpy, { sync: true, immediate: false });

      const changedKeys: string[][] = [];
      map.onChanged((keys) => changedKeys.push([...keys]));

      const disposedValues: number[] = [];
      map.onDisposeValue((v) => disposedValues.push(v));

      batch(() => {
        map.set("foo", 1);
        map.set("foo", 2);
        map.set("bar", 3);
      });

      expect(map.get("foo")).toBe(2);
      expect(map.get("bar")).toBe(3);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(changedKeys).toEqual([["foo", "bar"]]);
      expect(disposedValues).toEqual([1]);
    });
  });

  describe("delete", () => {
    it("deletes existing keys and ignores missing keys", () => {
      const map = reactiveMap<string, number>([
        ["foo", 1],
        ["bar", 2],
      ]);
      const notifySpy = vi.fn();
      map.$.subscribe(notifySpy, { sync: true, immediate: false });

      const changedKeys: string[][] = [];
      map.onChanged((keys) => changedKeys.push([...keys]));

      const disposedValues: number[] = [];
      map.onDisposeValue((v) => disposedValues.push(v));

      expect(map.delete("missing")).toBe(false);
      expect(notifySpy).not.toHaveBeenCalled();
      expect(changedKeys).toEqual([]);
      expect(disposedValues).toEqual([]);

      expect(map.delete("foo")).toBe(true);
      expect(map.has("foo")).toBe(false);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(changedKeys).toEqual([["foo"]]);
      expect(disposedValues).toEqual([1]);

      batch(() => {
        map.delete("bar");
        map.delete("missing");
      });
      expect(notifySpy).toHaveBeenCalledTimes(2);
      expect(changedKeys).toEqual([["foo"], ["bar"]]);
      expect(disposedValues).toEqual([1, 2]);
    });
  });

  describe("clear", () => {
    it("clears all entries and notifies once when non-empty", () => {
      const map = reactiveMap<string, number>([
        ["foo", 1],
        ["bar", 2],
      ]);
      const notifySpy = vi.fn();
      map.$.subscribe(notifySpy, { sync: true, immediate: false });

      const changedKeys: string[][] = [];
      map.onChanged((keys) => changedKeys.push([...keys]));

      const disposedValues: number[] = [];
      map.onDisposeValue((v) => disposedValues.push(v));

      map.clear();
      expect(map.size).toBe(0);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(changedKeys).toEqual([["foo", "bar"]]);
      expect(disposedValues).toEqual([1, 2]);

      // Clearing an already empty map does nothing
      map.clear();
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(changedKeys).toHaveLength(1);
      expect(disposedValues).toHaveLength(2);
    });
  });

  describe("rename", () => {
    it("renames a key without disposing its value", () => {
      const map = reactiveMap<string, number>([
        ["foo", 1],
        ["bar", 2],
      ]);
      const notifySpy = vi.fn();
      map.$.subscribe(notifySpy, { sync: true, immediate: false });

      const changedKeys: string[][] = [];
      map.onChanged((keys) => changedKeys.push([...keys]));

      const disposedValues: number[] = [];
      map.onDisposeValue((v) => disposedValues.push(v));

      // Missing key or same key does nothing
      map.rename("missing", "baz");
      map.rename("foo", "foo");
      expect(notifySpy).not.toHaveBeenCalled();

      // Rename to new key
      map.rename("foo", "baz");
      expect(map.has("foo")).toBe(false);
      expect(map.get("baz")).toBe(1);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(changedKeys).toEqual([["foo", "baz"]]);
      expect(disposedValues).toEqual([]);

      // Rename overwriting existing key disposes overwritten value
      map.rename("baz", "bar");
      expect(map.has("baz")).toBe(false);
      expect(map.get("bar")).toBe(1);
      expect(notifySpy).toHaveBeenCalledTimes(2);
      expect(changedKeys).toEqual([
        ["foo", "baz"],
        ["baz", "bar"],
      ]);
      expect(disposedValues).toEqual([2]);

      // Rename onto existing key holding the same value keeps the value alive
      map.set("dup", 1);
      disposedValues.length = 0;
      map.rename("dup", "bar");
      expect(map.has("dup")).toBe(false);
      expect(map.get("bar")).toBe(1);
      expect(disposedValues).toEqual([]);
    });
  });

  describe("replace", () => {
    it("replaces entries and only notifies or disposes actual changes", () => {
      const map = reactiveMap<string, number>([
        ["foo", 1],
        ["bar", 2],
      ]);
      const notifySpy = vi.fn();
      map.$.subscribe(notifySpy, { sync: true, immediate: false });

      const changedKeys: string[][] = [];
      map.onChanged((keys) => changedKeys.push([...keys]));

      const disposedValues: number[] = [];
      map.onDisposeValue((v) => disposedValues.push(v));

      // Same entries in different order: no notification
      map.replace([
        ["bar", 2],
        ["foo", 1],
      ]);
      expect(notifySpy).not.toHaveBeenCalled();
      expect(changedKeys).toEqual([]);
      expect(disposedValues).toEqual([]);

      // Swapping values between keys does not dispose kept values
      map.replace([
        ["foo", 2],
        ["bar", 1],
      ]);
      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect(changedKeys).toEqual([["foo", "bar"]]);
      expect(disposedValues).toEqual([]);

      // Replacing with a new set of entries disposes removed values
      map.replace([["baz", 3]]);
      expect(map.size).toBe(1);
      expect(map.get("baz")).toBe(3);
      expect(notifySpy).toHaveBeenCalledTimes(2);
      expect(changedKeys[1]).toEqual(["baz", "foo", "bar"]);
      expect(disposedValues).toEqual([2, 1]);

      // Replacing with duplicate keys still removes unvisited keys
      map.set("keep", 9);
      changedKeys.length = 0;
      disposedValues.length = 0;
      map.replace([
        ["keep", 10],
        ["keep", 11],
      ]);
      expect([...map.entries()]).toEqual([["keep", 11]]);
      expect(disposedValues).toEqual([9, 10, 3]);

      // Replacing into an initially empty map
      const empty = reactiveMap<string, number>();
      empty.replace([["x", 1]]);
      expect([...empty.entries()]).toEqual([["x", 1]]);
    });
  });

  describe("onChanged synchronization and lifecycle", () => {
    it("Incrementally syncs a target map with a shared dirty-key list", () => {
      const source = reactiveMap<string, number>([
        ["a", 1],
        ["b", 2],
      ]);
      const target = reactiveMap<string, number>();
      for (const [k, v] of source) {
        target.set(k, v * 10);
      }

      const stop = source.onChanged((keys) => {
        for (const key of keys) {
          if (source.has(key)) {
            target.set(key, source.get(key)! * 10);
          } else {
            target.delete(key);
          }
        }
      });

      batch(() => {
        source.set("a", 5);
        source.delete("b");
        source.set("c", 3);
      });

      expect([...target.entries()]).toEqual([
        ["a", 50],
        ["c", 30],
      ]);

      stop();
      source.set("a", 9);
      expect(target.get("a")).toBe(50);
    });

    it("supports multiple listeners and unsubscription during broadcast", () => {
      const map = reactiveMap<string, number>();
      const log: string[] = [];
      let stop2!: () => void;

      map.onChanged((keys) => {
        log.push(`1:${[...keys].join(",")}`);
        stop2();
        map.onChanged((k) => log.push(`3:${[...k].join(",")}`));
      });
      stop2 = map.onChanged((keys) => {
        log.push(`2:${[...keys].join(",")}`);
      });

      map.set("x", 1);
      expect(log).toEqual(["1:x"]);

      map.set("y", 2);
      expect(log).toEqual(["1:x", "1:y", "3:y"]);
    });

    it("handles large-batch reset and mid-batch unsubscribe/re-subscription", () => {
      const map = reactiveMap<string, number>();
      // Touch $ without subscribing to verify channel still flushes when $ has no observers
      void map.$;

      let received: string[] = [];
      const stop = map.onChanged((keys) => {
        received = [...keys];
      });

      batch(() => {
        for (let i = 0; i < 20; i++) {
          map.set(i === 0 ? "a" : `k${i}`, i);
        }
      });

      expect(received).toHaveLength(20);
      expect(received[0]).toBe("a");
      expect(received.includes("z")).toBe(false);

      // Unsubscribe mid-batch, then re-subscribe cleanly
      batch(() => {
        map.set("stale", 99);
        stop();
      });

      const fresh: string[][] = [];
      map.onChanged((keys) => fresh.push([...keys]));
      map.set("fresh", 1);
      expect(fresh).toEqual([["fresh"]]);
    });
  });

  describe("onDisposeValue", () => {
    it("does not dispose a value deleted and re-added in the same batch", () => {
      const map = reactiveMap<string, number>([["foo", 1]]);
      const spy = vi.fn();
      map.onDisposeValue(spy);

      batch(() => {
        map.delete("foo");
        map.set("foo", 1);
      });
      expect(spy).not.toHaveBeenCalled();

      batch(() => {
        map.delete("foo");
        map.set("foo", 2);
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(1);
    });

    it("does nothing when disposing an empty map", () => {
      const map = reactiveMap<string, number>();
      const spy = vi.fn();
      map.onDisposeValue(spy);
      map.dispose();
      expect(spy).not.toHaveBeenCalled();
    });

    it("handles undefined values and self-unsubscription during batch disposal", () => {
      const map = reactiveMap<string, number | undefined>([
        ["u", undefined],
        ["a", 1],
        ["b", 2],
      ]);
      const seen: (number | undefined)[] = [];
      const stop = map.onDisposeValue((v) => {
        seen.push(v);
        if (v === 1) {
          stop();
        }
      });

      expect(map.delete("u")).toBe(true);
      expect(seen).toEqual([undefined]);

      batch(() => {
        map.delete("a");
        map.delete("b");
      });
      expect(seen).toEqual([undefined, 1]);
    });

    it("deduplicates and cancels NaN disposals with SameValueZero", () => {
      const map = reactiveMap<string, number>([
        ["a", Number.NaN],
        ["b", Number.NaN],
      ]);
      const disposed: number[] = [];
      map.onDisposeValue((v) => disposed.push(v));

      batch(() => {
        map.delete("a");
        map.set("c", Number.NaN);
      });
      expect(disposed).toEqual([]);

      batch(() => {
        map.delete("b");
        map.delete("c");
      });
      expect(disposed).toHaveLength(1);
      expect(Number.isNaN(disposed[0])).toBe(true);
    });
  });

  describe("dispose & diagnostics", () => {
    it("disposes remaining values, disconnects observers, and rejects dev writes", () => {
      setDevMode(true);
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      const map = reactiveMap<string, number>([
        ["foo", 1],
        ["bar", 2],
      ]);
      const notifySpy = vi.fn();
      map.$.subscribe(notifySpy, { sync: true, immediate: false });
      const changedSpy = vi.fn();
      map.onChanged(changedSpy);
      const disposeValueSpy = vi.fn();
      map.onDisposeValue(disposeValueSpy);

      map.dispose();
      const firstDisposedAt = (map as { __dev_disposed_at?: Error }).__dev_disposed_at;
      expect(firstDisposedAt).toBeInstanceOf(Error);
      map.dispose();
      expect((map as { __dev_disposed_at?: Error }).__dev_disposed_at).toBe(firstDisposedAt);

      expect(map.size).toBe(2);
      expect(notifySpy).not.toHaveBeenCalled();
      expect(changedSpy).not.toHaveBeenCalled();
      expect(disposeValueSpy).toHaveBeenCalledTimes(2);
      expect(disposeValueSpy).toHaveBeenCalledWith(1);
      expect(disposeValueSpy).toHaveBeenCalledWith(2);

      // Late subscriptions after dispose are no-ops
      const lateChanged = vi.fn();
      map.onChanged(lateChanged)();
      const lateDisposed = vi.fn();
      map.onDisposeValue(lateDisposed)();

      expect(() => map.set("baz", 3)).toThrow("disposed");
      expect(consoleError).toHaveBeenCalledWith("ReactiveMap disposed at:", firstDisposedAt);
    });

    it("omits __dev_disposed_at in production and throws on write during computation in dev", () => {
      setDevMode(false);
      const prodMap = reactiveMap([["a", 1]]);
      prodMap.dispose();
      expect(Object.hasOwn(prodMap, "__dev_disposed_at")).toBe(false);
      // Accessing $ after dispose when $ was not previously created returns a disposed Readable
      expect(prodMap.$.get()).toBe(prodMap);

      setDevMode(true);
      const devMap = reactiveMap([["a", 1]]);
      const bad = computed(() => {
        devMap.set("a", 2);
        return 0;
      });
      expect(() => bad.get()).toThrow("write during computation");
      bad.dispose();
    });
  });
});
