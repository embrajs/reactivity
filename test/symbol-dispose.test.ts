import { describe, expect, it, vi } from "vitest";
import {
  computed,
  derived,
  type Owned,
  type Readable,
  reactiveList,
  reactiveMap,
  reactiveSet,
  readable,
  writable,
} from "../src";

describe("Symbol.dispose", () => {
  it("disposes writable, readable, computed, and derived via using", () => {
    const base$ = writable(1);
    const spy = vi.fn();

    let escapedWritable: ReturnType<typeof writable<number>>;
    let escapedReadable: ReturnType<typeof readable<number>>[0];
    let escapedComputed: ReturnType<typeof computed<number>>;
    let escapedDerived: Owned<Readable<number>>;

    {
      using w$ = writable(10);
      const [r$, setR] = readable(20);
      using rOwned$ = r$;
      using c$ = computed(() => base$.value + w$.value);
      using d$ = derived(rOwned$, (v) => v * 2);

      escapedWritable = w$;
      escapedReadable = rOwned$;
      escapedComputed = c$;
      escapedDerived = d$;

      c$.subscribe(spy, { sync: true });
      setR(25);
      expect(d$.value).toBe(50);
    }

    expect(escapedWritable.value).toBe(10);
    expect(escapedReadable.value).toBe(20 + 5);
    expect(escapedComputed.value).toBe(11);
    expect(escapedDerived.value).toBe(50);

    // Observer disconnected; writing to base$ no longer triggers spy
    spy.mockClear();
    base$.value = 2;
    expect(spy).not.toHaveBeenCalled();

    // Dev-mode disposed write guard still triggers
    expect(() => {
      escapedWritable.value = 99;
    }).toThrow("disposed");
  });

  it("disposes reactiveList, reactiveMap, and reactiveSet via using", () => {
    const disposedListValues: number[] = [];
    const disposedMapValues: string[] = [];
    const disposedSetValues: string[] = [];

    let escapedList: ReturnType<typeof reactiveList<number>>;
    let escapedMap: ReturnType<typeof reactiveMap<string, string>>;
    let escapedSet: ReturnType<typeof reactiveSet<string>>;

    {
      using list = reactiveList([1, 2]);
      using map = reactiveMap([["k", "v"]]);
      using set = reactiveSet(["a", "b"]);

      list.onDisposeValue((v) => disposedListValues.push(v));
      map.onDisposeValue((v) => disposedMapValues.push(v));
      set.onDisposeValue((v) => disposedSetValues.push(v));

      escapedList = list;
      escapedMap = map;
      escapedSet = set;
    }

    expect(disposedListValues).toEqual([1, 2]);
    expect(disposedMapValues).toEqual(["v"]);
    expect(disposedSetValues).toEqual(["a", "b"]);

    expect(() => escapedList.push(3)).toThrow("disposed");
    expect(() => escapedMap.set("k2", "v2")).toThrow("disposed");
    expect(() => escapedSet.add("c")).toThrow("disposed");
  });

  it("supports direct Symbol.dispose() calls on nodes and collections", () => {
    const w$ = writable(0);
    const list = reactiveList<number>();
    const map = reactiveMap<string, number>();
    const set = reactiveSet<number>();

    w$[Symbol.dispose]();
    list[Symbol.dispose]();
    map[Symbol.dispose]();
    set[Symbol.dispose]();

    expect(() => {
      w$.value = 1;
    }).toThrow("disposed");
    expect(() => list.push(1)).toThrow("disposed");
    expect(() => map.set("a", 1)).toThrow("disposed");
    expect(() => set.add(1)).toThrow("disposed");
  });
});
