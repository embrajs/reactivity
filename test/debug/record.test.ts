import { afterEach, describe, expect, it, vi } from "vitest";
import { batch, computed, reactiveList, watch, writable } from "../../src";
import { record } from "../../src/debug";
import { runtime } from "../../src/runtime";
import { setDevMode } from "../setup";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("record", () => {
  it("records synchronous operations, stats, and deterministic indented text", () => {
    const a$ = writable(1, { name: "a" });
    const b$ = computed(() => (a$.get() > 0 ? 10 : 0), { name: "b" });
    const stopSub = b$.subscribe(() => {}, { sync: true, immediate: false });
    const stopWatch = watch(
      function render() {
        b$.get();
      },
      { sync: true },
    );

    const rec = record(() => {
      batch(() => {
        a$.set(2);
        a$.set(2); // unchanged set
      });
      return a$.get();
    });

    expect(rec.result).toBe(2);
    expect(rec.error).toBeUndefined();
    expect(rec.stats).toEqual({
      sets: 1,
      unchangedSets: 1,
      computes: 0,
      unchangedComputes: 1,
      effects: 0,
      subscribes: 0,
      disposes: 0,
      errors: 0,
    });
    expect(rec.text).toBe(
      [
        "batch {",
        "  set writable(a): 1 -> 2",
        "  set writable(a): 2 -> 2 (unchanged)",
        "  compute computed(b): 10 (unchanged) <- triggered by writable(a): 1 -> 2",
        "}",
      ].join("\n"),
    );
    expect(runtime.__dev_spy).toBeUndefined();

    // Also test timing: true, changed compute, effect, subscribe, dispose
    const rec2 = record(
      () => {
        batch(() => {
          a$.set(-1);
        });
        stopWatch();
        stopSub();
        b$.dispose();
        a$.dispose();
      },
      { timing: true },
    );
    expect(rec2.stats).toEqual({
      sets: 1,
      unchangedSets: 0,
      computes: 1,
      unchangedComputes: 0,
      effects: 1,
      subscribes: 1,
      disposes: 3,
      errors: 0,
    });
    expect(rec2.text).toContain("ms)");
    expect(rec2.text).toContain("subscribe(sync) computed(b) -> 0 (1 listeners)");
    expect(rec2.text).toContain("effect watch(render) (");
    expect(rec2.text).toContain("dispose computed(b)");
  });

  it("records async operations and flushes", async () => {
    const x$ = writable("hi", { name: "x" });
    const stopSub = x$.subscribe(() => {}, { immediate: false });

    const rec = await record(async () => {
      x$.set("bye");
      await Promise.resolve();
      return x$.get();
    });

    expect(rec.result).toBe("bye");
    expect(rec.stats.subscribes).toBe(1);
    expect(rec.text).toContain('set writable(x): "hi" -> "bye"');
    expect(rec.text).toContain('flush(async) {\n  subscribe(async) writable(x) -> "bye" (1 listeners)');
    expect(runtime.__dev_spy).toBeUndefined();
    stopSub();
  });

  it("captures synchronous errors and rejected promises while cleaning up spy", async () => {
    const a$ = writable(0, { name: "a" });
    const bad$ = computed(
      () => {
        if (a$.get() > 0) {
          throw new Error("bad-compute");
        }
        return 0;
      },
      { name: "bad" },
    );
    expect(bad$.get()).toBe(0);

    const syncRec = record(() => {
      a$.set(1);
      bad$.get();
    });
    expect(syncRec.result).toBeUndefined();
    expect(syncRec.error).toBeInstanceOf(Error);
    expect(syncRec.stats.errors).toBe(1);
    expect(syncRec.text).toContain("compute computed(bad) threw: bad-compute");
    expect(runtime.__dev_spy).toBeUndefined();

    const asyncRec = await record(async () => {
      await Promise.resolve();
      throw "async-fail";
    });
    expect(asyncRec.result).toBeUndefined();
    expect(asyncRec.error).toBe("async-fail");
    expect(runtime.__dev_spy).toBeUndefined();
  });

  it("supports filter and formats collections/objects/functions safely", () => {
    const list = reactiveList([1, 2]);
    const fn$ = writable(() => {}, { name: "fn" });
    const map$ = writable(new Map([["k", 1]]), { name: "map" });
    const set$ = writable(new Set([1]), { name: "set" });
    const circular: any = {};
    circular.self = circular;
    const circ$ = writable<any>(null, { name: "circ" });

    const rec = record(
      () => {
        list.push(3);
        fn$.set(function named() {});
        map$.set(new Map());
        set$.set(new Set());
        circ$.set(circular);
      },
      { filter: /^(fn|map|set|circ)$/ },
    );
    expect(rec.stats.sets).toBe(4);
    expect(rec.text).toContain("[Function: named]");
    expect(rec.text).toContain("Map(0)");
    expect(rec.text).toContain("Set(0)");
    expect(rec.text).toContain("-> Object");
  });

  it("warns once and still runs fn in production mode", () => {
    setDevMode(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a$ = writable(1);
    const rec = record(() => {
      a$.set(2);
      return a$.get();
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(rec.result).toBe(2);
    expect(rec.events).toEqual([]);
    expect(rec.text).toBe("");
    expect(rec.stats.sets).toBe(0);
  });
});
