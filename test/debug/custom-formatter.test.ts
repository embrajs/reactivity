import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, derived, reactiveList, reactiveMap, reactiveSet, readable, watch, writable } from "../../src";
import { customFormatter, getObserverTree } from "../../src/debug";

interface DevToolsFormatter {
  header: (obj: unknown) => any;
  hasBody: (obj: unknown) => boolean;
  body: (obj: unknown) => any;
}

afterEach(() => {
  delete (globalThis as { devtoolsFormatters?: unknown[] }).devtoolsFormatters;
  vi.restoreAllMocks();
});

describe("customFormatter", () => {
  it("registers idempotently on globalThis.devtoolsFormatters", () => {
    customFormatter();
    customFormatter();
    const formatters = (globalThis as { devtoolsFormatters?: DevToolsFormatter[] }).devtoolsFormatters;
    expect(formatters).toHaveLength(1);
  });

  it("formats nodes and collections without triggering lazy evaluation or loops", () => {
    customFormatter();
    const formatter = (globalThis as { devtoolsFormatters?: DevToolsFormatter[] }).devtoolsFormatters![0];

    expect(formatter.header({})).toBeNull();
    expect(formatter.hasBody({})).toBe(false);

    const computeSpy = vi.fn(() => 42);
    const w$ = writable("hello", { name: "greeting" });
    const [r$] = readable(123);
    const c$ = computed(computeSpy, { name: "lazy" });
    const d$ = derived(w$, (s) => s.length, { name: "len" });
    const sym$ = writable(Symbol("s"));
    const bool$ = writable(true);
    const obj$ = writable({ a: 1 });

    // Dirty uninitialized computed must not evaluate
    expect(formatter.header(c$)).toBeTruthy();
    expect(computeSpy).not.toHaveBeenCalled();

    // Quoted string in header
    const wHeader = JSON.stringify(formatter.header(w$));
    expect(wHeader).toContain("Writable");
    expect(wHeader).toContain("(greeting)");
    expect(wHeader).toContain('\\"hello\\"');

    expect(JSON.stringify(formatter.header(r$))).toContain("Readable");
    expect(JSON.stringify(formatter.header(sym$))).toContain("Symbol(s)");
    expect(JSON.stringify(formatter.header(bool$))).toContain("true");
    expect(JSON.stringify(formatter.header(obj$))).toContain('"object"');

    // Body with deps, subs, subscribers, and disposedAt
    const stopSub = d$.subscribe(() => {}, { sync: true });
    const stopWatch = watch(() => {
      w$.get();
    });
    const watchNode = getObserverTree(w$)!.children.find((x) => x.kind === "watch")!.node;

    expect(formatter.hasBody(d$)).toBe(true);
    const dBody = formatter.body(d$) as any[];
    const dLabels = dBody.slice(2).map((row) => row[2][2]);
    expect(dLabels).toContain("deps: ");
    expect(dLabels).toContain("subscribers: ");

    expect(formatter.hasBody(w$)).toBe(true);
    const wBody = formatter.body(w$) as any[];
    const wLabels = wBody.slice(2).map((row) => row[2][2]);
    expect(wLabels).toContain("subs: ");

    // WatchNode header & body
    expect(JSON.stringify(formatter.header(watchNode))).toContain("Watch");
    expect(formatter.hasBody(watchNode)).toBe(true);
    expect(formatter.body(watchNode)).toBeTruthy();

    // Running computed must not throw loop detected
    let runningHeader: any;
    const running$ = computed(() => {
      runningHeader = formatter.header(running$);
      return 1;
    });
    expect(running$.get()).toBe(1);
    expect(JSON.stringify(runningHeader)).toContain("running");

    // Pending computed
    const p$ = computed(() => `${w$.get()}!`);
    expect(p$.get()).toBe("hello!");
    w$.set("world");
    expect(JSON.stringify(formatter.header(p$))).toContain("pending");

    // Disposed node with disposedAt
    w$.dispose();
    expect(JSON.stringify(formatter.header(w$))).toContain("disposed");
    const wDisposedBody = formatter.body(w$) as any[];
    expect(wDisposedBody.slice(2).map((row) => row[2][2])).toContain("disposedAt: ");

    // Collections
    const list = reactiveList([1, 2]);
    const map = reactiveMap([["a", 1]]);
    const set = reactiveSet([1]);
    expect(JSON.stringify(formatter.header(list))).toContain("ReactiveList");
    expect(JSON.stringify(formatter.header(map))).toContain("ReactiveMap");
    expect(JSON.stringify(formatter.header(set))).toContain("ReactiveSet");

    stopSub();
    stopWatch();
  });
});
