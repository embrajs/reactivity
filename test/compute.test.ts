import { describe, expect, it, vi } from "vitest";

import { reactiveArray, reactiveMap, reactiveSet, compute, writable } from "../src";

describe("compute", () => {
  it("should get non-readable", () => {
    const s = writable(123);
    const spy = vi.fn();
    const $ = compute(get => {
      return get(s) + get(321);
    });
    $.subscribe(spy);

    expect(spy).toBeCalledTimes(1);
    expect(spy).lastCalledWith(444);

    s.value = 42;
    expect(spy).toBeCalledTimes(2);
    expect(spy).lastCalledWith(363);
  });

  it("should get reactive collections", () => {
    const map1 = reactiveMap<string, number>();
    const map2 = reactiveMap<string, number>();
    const set = reactiveSet<number>();
    const arr = reactiveArray<number>();

    const spy = vi.fn();

    const $ = compute(get => {
      return [...get(map1).values(), ...get(map2.$).values(), ...get(set), ...get(arr)];
    });
    $.subscribe(spy);

    expect(spy).toBeCalledTimes(1);
    expect(spy).lastCalledWith([]);

    map1.set("a", 1);
    expect(spy).toBeCalledTimes(2);
    expect(spy).lastCalledWith([1]);

    map2.set("b", 2);
    expect(spy).toBeCalledTimes(3);
    expect(spy).lastCalledWith([1, 2]);

    set.add(3);
    expect(spy).toBeCalledTimes(4);
    expect(spy).lastCalledWith([1, 2, 3]);

    arr.push(4);
    expect(spy).toBeCalledTimes(5);
    expect(spy).lastCalledWith([1, 2, 3, 4]);
  });
});
