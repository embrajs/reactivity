import { afterEach, describe, expect, it, vi } from "vitest";
import { batch, computed, derived, reactiveList, reactiveMap, reactiveSet, readable, watch, writable } from "../../src";
import { formatTree, getDependencyTree, getObserverTree, inspect, type NodeSnapshot } from "../../src/debug";
import { setDevMode } from "../setup";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inspect", () => {
  it("inspects current observer when called with no arguments, and returns null for inspect(undefined)", () => {
    expect(inspect()).toBeNull();
    expect(inspect(undefined)).toBeNull();
    expect(inspect(null)).toBeNull();
    expect(inspect(42)).toBeNull();
    expect(inspect({})).toBeNull();

    const a$ = writable(1, { name: "a" });
    let insideComputed: NodeSnapshot | null = null;
    let explicitUndefinedInsideComputed: NodeSnapshot | null = null;
    const b$ = computed(
      () => {
        explicitUndefinedInsideComputed = inspect(undefined);
        const val = a$.get() * 2;
        insideComputed = inspect();
        return val;
      },
      { name: "b" },
    );
    expect(b$.get()).toBe(2);
    expect(explicitUndefinedInsideComputed).toBeNull();
    expect(insideComputed).toMatchObject({
      kind: "computed",
      name: "b",
      running: true,
      deps: [a$],
    });

    let insideWatch: NodeSnapshot | null = null;
    const stop = watch(function myWatch() {
      b$.get();
      insideWatch = inspect();
    });
    expect(insideWatch).toMatchObject({
      kind: "watch",
      name: "myWatch",
      running: true,
      connected: true,
      deps: [b$],
    });
    stop();
  });

  it("inspects writable, readable, computed, and derived without triggering lazy evaluation", () => {
    const computeSpy = vi.fn(() => 10);
    const w$ = writable(1, { name: "w" });
    const [r$, setR] = readable("hi", { name: "r" });
    const c$ = computed(computeSpy, { name: "c" });
    const d$ = derived(w$, (v) => v + 1, { name: "d" });

    expect(inspect(w$)).toMatchObject({
      kind: "writable",
      name: "w",
      value: 1,
      initialized: true,
      dirty: false,
      connected: false,
      disposed: false,
    });
    expect(inspect(r$)).toMatchObject({
      kind: "readable",
      name: "r",
      value: "hi",
      initialized: true,
    });
    expect(inspect(c$)).toMatchObject({
      kind: "computed",
      name: "c",
      value: undefined,
      initialized: false,
      dirty: true,
      connected: false,
    });
    expect(inspect(d$)).toMatchObject({
      kind: "derived",
      name: "d",
      value: undefined,
      initialized: false,
      dirty: true,
      deps: [],
    });
    expect(computeSpy).not.toHaveBeenCalled();

    setR("bye");
    expect(inspect(r$)?.value).toBe("bye");
    expect(c$.get()).toBe(10);
    expect(inspect(c$)).toMatchObject({
      initialized: true,
      dirty: false,
      value: 10,
    });
    expect(d$.get()).toBe(2);
    expect(inspect(d$)).toMatchObject({
      initialized: true,
      dirty: false,
      deps: [w$],
    });
  });

  it("inspects reactive collections without triggering tracking or allocating $", () => {
    const list = reactiveList([1, 2]);
    const map = reactiveMap([["a", 1]]);
    const set = reactiveSet(["x"]);

    expect(inspect(list)).toMatchObject({ kind: "list", value: [1, 2], connected: false, disposed: false });
    expect(inspect(map)).toMatchObject({ kind: "map", connected: false, disposed: false });
    expect((inspect(map)?.value as Map<string, number>).get("a")).toBe(1);
    expect((inspect(set)?.value as Set<string>).has("x")).toBe(true);

    // Inspecting inside a computed must not track the collection
    let runs = 0;
    const c$ = computed(() => {
      runs++;
      inspect(list);
      inspect(map);
      inspect(set);
      return 1;
    });
    expect(c$.get()).toBe(1);
    expect(runs).toBe(1);
    list.push(3);
    map.set("b", 2);
    set.add("y");
    expect(c$.get()).toBe(1);
    expect(runs).toBe(1);

    // With subscriber on .$
    const stop = list.$.subscribe(() => {});
    expect(inspect(list)).toMatchObject({ connected: true, asyncSubscriberCount: 1, syncSubscriberCount: 0 });
    stop();
  });

  it("reports disposed state and disposedAt in development, and omits disposedAt in production", () => {
    const w$ = writable(1);
    w$.dispose();
    expect(inspect(w$)?.disposed).toBe(true);
    expect(inspect(w$)?.disposedAt).toBeInstanceOf(Error);

    setDevMode(false);
    const wProd$ = writable(2);
    wProd$.dispose();
    expect(inspect(wProd$)?.disposed).toBe(true);
    expect(inspect(wProd$)?.disposedAt).toBeNull();
  });

  it("builds and formats dependency and observer trees", () => {
    expect(getDependencyTree(null)).toBeNull();
    expect(getObserverTree(undefined)).toBeNull();

    const a$ = writable(1, { name: "a" });
    const b$ = computed(() => a$.get() * 2, { name: "b" });
    const c$ = derived([a$, b$], (a, b) => a + b, { name: "c" });
    const stopSub = c$.subscribe(() => {}, { sync: true });
    const stopAsyncSub = c$.subscribe(() => {});

    const depTree = getDependencyTree(c$)!;
    expect(depTree.kind).toBe("derived");
    expect(depTree.children.map((x) => x.name)).toEqual(["a", "b"]);

    const obsTree = getObserverTree(a$)!;
    expect(obsTree.kind).toBe("writable");
    expect(obsTree.children.length).toBe(2);

    const formattedDep = formatTree(depTree);
    expect(formattedDep).toContain("derived(c) = 3 [sync:1, async:1]");
    expect(formattedDep).toContain("├─ writable(a) = 1");
    expect(formattedDep).toContain("└─ computed(b) = 2");

    // Direct target overload and invalid target
    expect(formatTree(c$)).toBe(formattedDep);
    expect(formatTree(a$, "subs")).toBe(formatTree(getObserverTree(a$)!));
    expect(formatTree(null)).toBe("");

    // compute_.name fallback and stable 4-hex handles for anonymous nodes
    const namedFnComputed$ = computed(function calcTotal() {
      return a$.get();
    });
    expect(inspect(namedFnComputed$)?.name).toBe("calcTotal");
    expect(formatTree(namedFnComputed$)).toContain("computed(calcTotal)");

    const anon1$ = writable(1);
    const anon2$ = writable(2);
    const tree1 = formatTree(anon1$);
    const tree2 = formatTree(anon1$);
    const tree3 = formatTree(anon2$);
    expect(tree1).toMatch(/^writable@[0-9a-f]{4} = 1$/);
    expect(tree1).toBe(tree2);
    expect(tree3).toMatch(/^writable@[0-9a-f]{4} = 2$/);

    // Mark dirty & pending to cover tree status tags and various value summaries
    a$.set(2);
    const fnVal$ = writable(function namedFn() {}, { name: "fn" });
    const anonFn$ = writable(() => {});
    const arr$ = writable([1, 2]);
    const map$ = writable(new Map([["k", 1]]));
    const set$ = writable(new Set([1]));
    const obj$ = writable({ x: 1 });
    const str$ = writable("abc");
    const nullProto$ = writable(Object.create(null));
    const root$ = derived([fnVal$, anonFn$, arr$, map$, set$, obj$, str$, nullProto$], () => 0);
    root$.get();
    const formattedValues = formatTree(getDependencyTree(root$)!);
    expect(formattedValues).toContain("[Function: namedFn]");
    expect(formattedValues).toContain("Array(2)");
    expect(formattedValues).toContain("Map(1)");
    expect(formattedValues).toContain("Set(1)");
    expect(formattedValues).toContain("Object");
    expect(formattedValues).toContain('"abc"');

    // Also cover watch node, pending, running, and collection name in observer tree
    const stopWatch = watch(() => {
      c$.get();
    });
    const watchNode = getObserverTree(c$)!.children.find((node) => node.kind === "watch")!.node;
    batch(() => {
      a$.set(3);
      expect(formatTree(getObserverTree(a$)!)).toContain("watch");
      expect(formatTree(getObserverTree(a$)!)).toContain("[dirty, pending]");
    });

    let runningFormatted = "";
    const running$ = computed(() => {
      runningFormatted = formatTree(getDependencyTree(running$)!);
      return 1;
    });
    expect(running$.get()).toBe(1);
    expect(runningFormatted).toContain("[dirty, running]");

    const list = reactiveList([1]);
    const stopListSub = list.$.subscribe(() => {});
    expect(formatTree(getObserverTree(list)!)).toMatch(/list@[0-9a-f]{4} = Array\(1\)/);
    stopListSub();

    stopWatch();
    expect(inspect(watchNode)).toMatchObject({ kind: "watch", name: "", disposed: true });
    stopSub();
    stopAsyncSub();
    expect(formatTree(getDependencyTree(c$)!)).toContain("[dirty]");
    c$.dispose();
    expect(formatTree(getDependencyTree(c$)!)).toContain("[disposed]");
  });
});
