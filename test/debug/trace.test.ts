import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, reactiveList, reactiveMap, reactiveSet, watch, writable } from "../../src";
import { inspect, type TraceEvent, trace, untrace } from "../../src/debug";
import { runtime } from "../../src/runtime";
import { setDevMode } from "../setup";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("trace", () => {
  it("preserves computed laziness and automatic disconnection", () => {
    const events: TraceEvent[] = [];
    const computeSpy = vi.fn(() => a$.get() * 2);
    const a$ = writable(1, { name: "a" });
    const b$ = computed(computeSpy, { name: "b" });

    const returned = trace(b$, { onEvent: (e) => events.push(e) });
    expect(returned).toBe(b$);

    // Tracing must not trigger initial evaluation or connect b$
    expect(computeSpy).not.toHaveBeenCalled();
    expect(inspect(b$)?.connected).toBe(false);
    expect(events).toHaveLength(0);

    a$.set(2);
    expect(computeSpy).not.toHaveBeenCalled();

    // Downstream subscribe connects and evaluates b$
    const stop = b$.subscribe(() => {}, { sync: true });
    expect(computeSpy).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].value).toBe(4);

    // Unsubscribe disconnects b$; further writes to a$ stay lazy
    stop();
    expect(inspect(b$)?.connected).toBe(false);
    a$.set(3);
    expect(computeSpy).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);

    // Reading b$ again triggers evaluation and trace
    expect(b$.get()).toBe(6);
    expect(events).toHaveLength(2);
    expect(events[1].prevValue).toBe(4);
    expect(events[1].value).toBe(6);

    untrace(b$);
  });

  it("deduplicates repeated trace calls and cleans up via untrace or dispose", () => {
    const events1: TraceEvent[] = [];
    const events2: TraceEvent[] = [];
    const a$ = writable(0, { name: "a" });

    expect(trace(a$, { onEvent: (e) => events1.push(e) })).toBe(a$);
    expect(trace(a$, { onEvent: (e) => events2.push(e) })).toBe(a$);

    a$.set(1);
    expect(events1).toHaveLength(0);
    expect(events2).toHaveLength(1);
    expect(events2[0].prevValue).toBe(0);
    expect(events2[0].value).toBe(1);

    // Unchanged set is ignored
    a$.set(1);
    expect(events2).toHaveLength(1);

    untrace(a$);
    expect(runtime.__dev_spy).toBeUndefined();
    a$.set(2);
    expect(events2).toHaveLength(1);

    // Auto-cleanup on dispose
    trace(a$, { onEvent: (e) => events2.push(e) });
    a$.dispose();
    expect(runtime.__dev_spy).toBeUndefined();
  });

  it("traces reactive collections with and without observers", () => {
    const events: TraceEvent[] = [];
    const list = reactiveList([1]);
    const map = reactiveMap([["k", 1]]);
    const set = reactiveSet(["a"]);

    expect(trace(list, { onEvent: (e) => events.push(e) })).toBe(list);
    expect(trace(list, { onEvent: (e) => events.push(e) })).toBe(list);
    expect(trace(map, { onEvent: (e) => events.push(e) })).toBe(map);
    expect(trace(set, { onEvent: (e) => events.push(e) })).toBe(set);

    list.push(2);
    map.set("k", 2);
    set.add("b");

    expect(events).toHaveLength(3);
    expect(events[0].kind).toBe("list");
    expect(events[0].value).toEqual([1, 2]);
    expect(events[1].kind).toBe("map");
    expect(events[2].kind).toBe("set");

    untrace(list);
    untrace(map);
    untrace(set);
    expect(runtime.__dev_spy).toBeUndefined();
  });

  it("traces functions with deduplication, this.dispose(), and dependency diffs", () => {
    const events: TraceEvent[] = [];
    const a$ = writable(1, { name: "a" });
    const b$ = writable(2);
    const toggle$ = writable(true, { name: "toggle" });

    function effectFn(this: { dispose(): void }): undefined {
      const t = toggle$.get();
      if (t) {
        a$.get();
        b$.get();
      } else {
        a$.get();
      }
      if (a$.get() > 10) {
        this.dispose();
      }
      return undefined;
    }

    const wrapped1 = trace(effectFn, { onEvent: (e) => events.push(e) });
    const wrapped2 = trace(effectFn, { onEvent: (e) => events.push(e) });
    const wrapped3 = trace(wrapped1, { onEvent: (e) => events.push(e) });
    expect(wrapped1).toBe(wrapped2);
    expect(wrapped1).toBe(wrapped3);

    const stop = watch(wrapped1, { sync: true });
    expect(events).toHaveLength(1);
    expect(events[0].deps.map((d) => d.status)).toEqual(["added", "added", "added"]);

    // Trace a$ passively so causal trigger is recorded without extra subscriptions
    trace(a$, { onEvent: () => {} });
    // Update a$ -> toggle$ unchanged, a$ updated, b$ unchanged
    a$.set(2);
    expect(events).toHaveLength(2);
    expect(events[1].deps.map((d) => d.status)).toEqual(["unchanged", "updated", "unchanged"]);
    expect(events[1].cause?.source).toBe(a$);

    // Toggle off -> b$ removed
    toggle$.set(false);
    expect(events).toHaveLength(3);
    expect(events[2].deps.map((d) => d.status)).toEqual(["updated", "unchanged", "removed"]);

    // Trigger this.dispose() inside callback
    a$.set(11);
    expect(events).toHaveLength(4);
    a$.set(12);
    expect(events).toHaveLength(4);

    // untrace on wrapped or original disables tracing while keeping passthrough
    untrace(wrapped1);
    let runs = 0;
    const rawFn = () => {
      runs++;
      return a$.get();
    };
    const tracedRaw = trace(rawFn, { onEvent: (e) => events.push(e) });
    untrace(rawFn);
    expect(tracedRaw()).toBe(12);
    expect(runs).toBe(1);
    expect(events).toHaveLength(4);

    stop();
    untrace(a$);
  });

  it("logs formatted console output, handles errors, and supports break", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const group = vi.spyOn(console, "group").mockImplementation(() => {});
    const groupCollapsed = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    const groupEnd = vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    const traceSpy = vi.spyOn(console, "trace").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const a$ = writable(1, { name: "a" });
    const b$ = computed(() => a$.get() * 2, { name: "b" });
    trace(a$, { name: "custom-a", defaultExpand: false, printStack: false, break: true });
    trace(b$, { defaultExpand: true, printStack: true });

    a$.set(2);
    expect(b$.get()).toBe(4);
    a$.set(3);
    expect(b$.get()).toBe(6);

    expect(groupCollapsed).toHaveBeenCalled();
    expect(group).toHaveBeenCalled();
    expect(traceSpy).toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    expect(groupEnd).toHaveBeenCalled();

    // Collection without prevValue in default console logger
    const list = reactiveList([1]);
    trace(list);
    list.push(2);

    // Traced function with default console logger covering added/updated/unchanged/removed
    const t$ = writable(true, { name: "t" });
    const u$ = writable(10, { name: "u" });
    const stopW = watch(
      trace(
        () => {
          if (t$.get()) {
            u$.get();
          }
          a$.get();
          return undefined;
        },
        { printStack: true },
      ),
      { sync: true },
    );
    a$.set(4);
    t$.set(false);
    stopW();

    // Traced function with no dependencies (covers depTail_ === null)
    const stopEmpty = watch(trace(() => undefined));
    stopEmpty();

    // Error in traced function
    const badFn = trace(
      () => {
        throw new Error("fn-fail");
      },
      { printStack: false, break: true },
    );
    expect(() => badFn()).toThrow("fn-fail");
    expect(errorSpy).toHaveBeenCalled();

    // Computed node without cause/stack
    const c$ = computed(() => {
      throw new Error("comp-fail");
    });
    trace(c$, { printStack: false });
    expect(() => c$.get()).toThrow("comp-fail");

    untrace(list);
    untrace(a$);
    untrace(b$);
    untrace(c$);
  });

  it("throws TypeError for invalid trace targets and ignores untrace on untraced targets", () => {
    expect(() => trace(123 as any)).toThrow(TypeError);
    expect(() => untrace(123)).not.toThrow();
    expect(() => untrace(() => {})).not.toThrow();
    expect(() => untrace({})).not.toThrow();
  });

  it("warns once for trace(node) in production while trace(fn) continues working", () => {
    setDevMode(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a$ = writable(1);
    const list = reactiveList([1]);

    expect(trace(a$)).toBe(a$);
    expect(trace(list)).toBe(list);
    expect(warn).toHaveBeenCalledTimes(1);

    const events: TraceEvent[] = [];
    const fn = trace(
      () => {
        a$.get();
        return undefined;
      },
      { onEvent: (e) => events.push(e) },
    );
    const stop = watch(fn, { sync: true });
    expect(events).toHaveLength(1);
    expect(events[0].deps).toHaveLength(1);
    stop();
    untrace(a$);
  });
});
