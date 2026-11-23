import { describe, expect, it, vi } from "vitest";
import { computed, reactiveList, reactiveMap, reactiveSet, untrack, watch, writable } from "../src";

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
