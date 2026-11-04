import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { arrayShallowEqual, derived, type Equality, writable } from "../src";

describe("arrayShallowEqual", () => {
  it.each([
    [[], [], true],
    [[1, "a", true], [1, "a", true], true],
    [[1, 2], [1, 2, 3], false],
    [[1, 2], [2, 1], false],
    [[1, 2], [1, 3], false],
    [[NaN], [NaN], true],
    [[0], [-0], false],
    [null, null, true],
    [undefined, undefined, true],
    [NaN, NaN, true],
    [0, -0, false],
    [1, 1, true],
    [1, 2, false],
    [[], null, false],
    [null, [], false],
    [[1], { 0: 1, length: 1 }, false],
  ])("compares %j and %j as %s", (previous, next, equal) => {
    expect(arrayShallowEqual(previous, next)).toBe(equal);
  });

  it("compares objects, functions and nested arrays by identity", () => {
    const object = {};
    const callback = () => {};
    const nested = [1];

    expect(arrayShallowEqual([object, callback, nested], [object, callback, nested])).toBe(true);
    expect(arrayShallowEqual([object], [{}])).toBe(false);
    expect(arrayShallowEqual([callback], [() => {}])).toBe(false);
    expect(arrayShallowEqual([nested], [[1]])).toBe(false);
    expect(arrayShallowEqual(object, object)).toBe(true);
    expect(arrayShallowEqual(object, {})).toBe(false);
  });

  it("compares holes as undefined and ignores extra array properties", () => {
    expect(arrayShallowEqual(new Array(2), [undefined, undefined])).toBe(true);
    expect(arrayShallowEqual(Object.assign([1], { extra: 1 }), Object.assign([1], { extra: 2 }))).toBe(true);
  });

  it("works as an equality function for readonly tuples", () => {
    expectTypeOf(arrayShallowEqual).toExtend<Equality<readonly [number, string]>>();
    const initial = [1, "a"] as const;
    const source = writable<readonly [number, string]>(initial, { equal: arrayShallowEqual });
    const spy = vi.fn();
    const stop = source.subscribe(spy, { sync: true });

    source.set([1, "a"]);
    expect(source.get()).toBe(initial);
    expect(spy.mock.calls).toEqual([[initial]]);
    source.set([2, "a"]);
    expect(spy.mock.calls).toEqual([[initial], [[2, "a"]]]);
    stop();
  });

  it("preserves a derived array when its selected elements do not change", () => {
    const source = writable({ first: 1, second: 2, ignored: 0 });
    const value = derived(source, (next) => [next.first, next.second], { equal: arrayShallowEqual });
    const initial = value.get();
    const spy = vi.fn();
    const stop = value.subscribe(spy, { sync: true });

    source.set({ first: 1, second: 2, ignored: 1 });
    expect(value.get()).toBe(initial);
    expect(spy.mock.calls).toEqual([[initial]]);
    source.set({ first: 3, second: 2, ignored: 1 });
    expect(spy.mock.calls).toEqual([[initial], [[3, 2]]]);
    stop();
  });
});
