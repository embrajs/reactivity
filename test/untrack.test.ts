import { describe, expect, it, vi } from "vitest";
import {
  batch,
  computed,
  derived,
  reactiveList,
  reactiveMap,
  reactiveSet,
  readable,
  untrack,
  watch,
  writable,
} from "../src";

describe("untrack", () => {
  it("reads sources inside computed without tracking them as dependencies", () => {
    const tracked$ = writable(1);
    const untracked$ = writable(10);
    const computeSpy = vi.fn(() => tracked$.value + untrack(() => untracked$.value));
    const sum$ = computed(computeSpy);

    expect(sum$.value).toBe(11);
    expect(computeSpy).toHaveBeenCalledTimes(1);

    untracked$.value = 20;
    expect(sum$.value).toBe(11);
    expect(computeSpy).toHaveBeenCalledTimes(1);

    tracked$.value = 2;
    expect(sum$.value).toBe(22);
    expect(computeSpy).toHaveBeenCalledTimes(2);
  });

  it("supports passing source.get directly without a wrapper closure", () => {
    const tracked$ = writable(1);
    const untracked$ = writable(100);
    const result$ = computed(() => tracked$.value + untrack(untracked$.get));

    expect(result$.value).toBe(101);

    untracked$.value = 200;
    expect(result$.value).toBe(101);

    tracked$.value = 2;
    expect(result$.value).toBe(202);
  });

  it("recomputes a dirty computed read inside untrack without subscribing to it", () => {
    const base$ = writable(2);
    const doubled$ = computed(() => base$.value * 2);
    const trigger$ = writable(0);

    const log: number[] = [];
    const stop = watch(
      () => {
        trigger$.value;
        log.push(untrack(doubled$.get));
      },
      { sync: true },
    );

    expect(log).toEqual([4]);

    base$.value = 5;
    expect(log).toEqual([4]);

    trigger$.value = 1;
    expect(log).toEqual([4, 10]);

    stop();
  });

  it("prevents tracking reactive collections read inside untrack", () => {
    const trigger$ = writable(0);
    const list = reactiveList([1, 2]);
    const map = reactiveMap([["a", 10]]);
    const set = reactiveSet(["x"]);

    const spy = vi.fn();
    const stop = watch(
      () => {
        trigger$.value;
        spy(
          untrack(() => ({
            item: list.get(0),
            mapped: map.get("a"),
            hasX: set.has("x"),
          })),
        );
      },
      { sync: true },
    );

    expect(spy).toHaveBeenCalledTimes(1);

    list.push(3);
    map.set("a", 20);
    set.add("y");
    expect(spy).toHaveBeenCalledTimes(1);

    trigger$.value = 1;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith({ item: 1, mapped: 20, hasX: true });

    stop();
  });

  it("supports nested untrack and restores tracking after exceptions", () => {
    const a$ = writable(1);
    const b$ = writable(2);
    const c$ = writable(3);

    const spy = vi.fn();
    const stop = watch(
      () => {
        const a = a$.value;
        try {
          untrack(() => {
            b$.value;
            untrack(() => {
              c$.value;
            });
            throw new Error("boom");
          });
        } catch {
          // Ignore error to verify observer restoration
        }
        spy(a + c$.value);
      },
      { sync: true },
    );

    expect(spy.mock.calls).toEqual([[4]]);

    b$.value = 20;
    expect(spy.mock.calls).toEqual([[4]]);

    c$.value = 30;
    expect(spy.mock.calls).toEqual([[4], [31]]);

    a$.value = 10;
    expect(spy.mock.calls).toEqual([[4], [31], [40]]);

    stop();
  });

  it("preserves the dev-mode write guard inside computed", () => {
    const target$ = writable(0);
    const bad$ = computed(() => untrack(() => target$.set(1)));

    expect(() => bad$.value).toThrow("write during computation");
  });
});

describe("peek", () => {
  it("is shared on the prototype across writable, readable, computed, and derived", () => {
    const w$ = writable(0);
    const [r$] = readable(0);
    const c$ = computed(() => w$.get());
    const d$ = derived(w$, (v) => v);

    expect(Object.hasOwn(w$, "peek")).toBe(false);
    expect(Object.hasOwn(r$, "peek")).toBe(false);
    expect(Object.hasOwn(c$, "peek")).toBe(false);
    expect(Object.hasOwn(d$, "peek")).toBe(false);
    expect(w$.peek).toBe(r$.peek);
    expect(w$.peek).toBe(c$.peek);
    expect(w$.peek).toBe(d$.peek);
  });

  it("reads writable and readable without tracking dependencies in computed and watch", () => {
    const tracked$ = writable(1);
    const untrackedW$ = writable(10);
    const [untrackedR$, setUntrackedR] = readable(100);

    const sum$ = computed(() => tracked$.get() + untrackedW$.peek() + untrackedR$.peek());
    expect(sum$.get()).toBe(111);

    untrackedW$.set(20);
    setUntrackedR(200);
    expect(sum$.get()).toBe(111);

    tracked$.set(2);
    expect(sum$.get()).toBe(222);

    const seen: number[] = [];
    const stop = watch(
      () => {
        seen.push(tracked$.get() + untrackedW$.peek() + untrackedR$.peek());
      },
      { sync: true },
    );
    expect(seen).toEqual([222]);

    untrackedW$.set(30);
    setUntrackedR(300);
    expect(seen).toEqual([222]);

    tracked$.set(3);
    expect(seen).toEqual([222, 333]);

    stop();
  });

  it("evaluates lazy, dirty, and pending computed/derived nodes without tracking or lingering upstream links", () => {
    const base$ = writable(1);
    const gate$ = computed(() => (base$.get() > 0 ? 1 : 0));
    const doubled$ = derived(gate$, (v) => v * 10);
    const lazy$ = computed(() => base$.get() + 100);
    const trigger$ = writable(0);

    // Lazy (never evaluated yet)
    expect(lazy$.peek()).toBe(101);

    // Connected watch reads doubled$.peek() without subscribing to doubled$ or gate$
    const seen: number[] = [];
    const stop = watch(
      () => {
        trigger$.get();
        seen.push(doubled$.peek());
      },
      { sync: true },
    );
    expect(seen).toEqual([10]);

    // Changing base$ from 1 -> 2 makes gate$ Dirty and doubled$ Pending (via active downstream? No, doubled$ is detached).
    // Even if gate$ is observed elsewhere, doubled$ stays Pending when gate$ is unchanged.
    const gateStop = watch(() => {
      gate$.get();
    });
    expect(doubled$.peek()).toBe(10);

    base$.set(2);
    expect(seen).toEqual([10]);

    // Trigger watch so doubled$.peek() runs while doubled$ may be Pending/Dirty
    trigger$.set(1);
    expect(seen).toEqual([10, 10]);

    base$.set(-1);
    expect(seen).toEqual([10, 10]);

    trigger$.set(2);
    expect(seen).toEqual([10, 10, 0]);

    gateStop();
    stop();
  });

  it("detects self-referential loops when peeking a running computed", () => {
    const self$: ReturnType<typeof computed<number>> = computed(() => self$.peek() + 1);
    expect(() => self$.peek()).toThrow("loop detected");
  });

  it("does not clear ValueNode coalescing flags during a batch", () => {
    const source$ = writable(0);
    const runs = vi.fn();

    const stop = watch(
      () => {
        runs(source$.get());
      },
      { sync: true },
    );
    expect(runs.mock.calls).toEqual([[0]]);

    batch(() => {
      source$.set(1);
      expect(source$.peek()).toBe(1);
      source$.set(0);
    });

    // Returned to the observed value (0) within the batch, so watch must skip re-running.
    expect(runs.mock.calls).toEqual([[0]]);

    stop();
  });

  it("returns the last frozen value after disposal", () => {
    const w$ = writable(1);
    const c$ = computed(() => w$.get() * 2);
    expect(c$.peek()).toBe(2);

    w$.set(5);
    c$.dispose();
    w$.dispose();

    expect(w$.peek()).toBe(5);
    expect(c$.peek()).toBe(2);
  });
});
