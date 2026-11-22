// @vitest-environment jsdom

import {
  computed,
  derived,
  type Readable,
  reactiveList,
  reactiveMap,
  reactiveSet,
  readable,
  writable,
} from "@embra/reactivity";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { StrictMode, useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useValue } from "../../src/react";

afterEach(cleanup);

describe("useValue", () => {
  it("reads and subscribes to writable, readable, computed, and derived", () => {
    const w$ = writable(1);
    const [r$, setR] = readable("a");
    const c$ = computed(() => w$.value * 10);
    const d$ = derived(w$, (v) => v + 100);

    const wHook = renderHook(() => useValue(w$));
    const rHook = renderHook(() => useValue(r$));
    const cHook = renderHook(() => useValue(c$));
    const dHook = renderHook(() => useValue(d$));

    expect(wHook.result.current).toBe(1);
    expect(rHook.result.current).toBe("a");
    expect(cHook.result.current).toBe(10);
    expect(dHook.result.current).toBe(101);

    act(() => {
      w$.set(2);
      setR("b");
    });

    expect(wHook.result.current).toBe(2);
    expect(rHook.result.current).toBe("b");
    expect(cHook.result.current).toBe(20);
    expect(dHook.result.current).toBe(102);
  });

  it("passes through non-Readable values (primitives, functions, nullish) and supports switching", () => {
    const fn1 = () => 1;
    const fn2 = () => 2;
    const v$ = writable<number | (() => number) | undefined>(10);

    const { result, rerender } = renderHook(({ src }) => useValue(src), {
      initialProps: { src: 1 as number | (() => number) | undefined | Readable<number | (() => number) | undefined> },
    });

    expect(result.current).toBe(1);

    rerender({ src: fn1 });
    expect(result.current).toBe(fn1);

    rerender({ src: undefined });
    expect(result.current).toBeUndefined();

    rerender({ src: v$ });
    expect(result.current).toBe(10);

    act(() => v$.set(fn2));
    expect(result.current).toBe(fn2);

    rerender({ src: 42 });
    expect(result.current).toBe(42);
  });

  it("triggers re-render on equal: false and reactive collections .$ even with same reference", () => {
    const obj = { count: 0 };
    const obj$ = writable(obj, { equal: false });
    const list = reactiveList([1, 2]);
    const map = reactiveMap([["a", 1]]);
    const set = reactiveSet(["x"]);

    const objHook = renderHook(() => useValue(obj$).count);
    const listHook = renderHook(() => useValue(list.$).length);
    const mapHook = renderHook(() => useValue(map.$).size);
    const setHook = renderHook(() => useValue(set.$).size);

    expect(objHook.result.current).toBe(0);
    expect(listHook.result.current).toBe(2);
    expect(mapHook.result.current).toBe(1);
    expect(setHook.result.current).toBe(1);

    act(() => {
      obj.count = 1;
      obj$.set(obj);
      list.push(3);
      map.set("b", 2);
      set.add("y");
    });

    expect(objHook.result.current).toBe(1);
    expect(listHook.result.current).toBe(3);
    expect(mapHook.result.current).toBe(2);
    expect(setHook.result.current).toBe(2);
  });

  it("respects custom equality on source", () => {
    const renderSpy = vi.fn();
    const pos$ = writable({ x: 1, y: 2 }, { equal: (a, b) => a.x === b.x && a.y === b.y });

    const { result } = renderHook(() => {
      renderSpy();
      return useValue(pos$);
    });

    expect(result.current).toEqual({ x: 1, y: 2 });
    expect(renderSpy).toHaveBeenCalledTimes(1);

    act(() => pos$.set({ x: 1, y: 2 }));
    expect(renderSpy).toHaveBeenCalledTimes(1);

    act(() => pos$.set({ x: 3, y: 4 }));
    expect(result.current).toEqual({ x: 3, y: 4 });
    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  it("defaults to sync: true (controlled input safe) and supports sync: false", async () => {
    const text$ = writable("");
    function ControlledInput() {
      const value = useValue(text$);
      return <input aria-label="name" value={value} onChange={(e) => text$.set(e.target.value)} />;
    }

    const { getByLabelText } = render(<ControlledInput />);
    const input = getByLabelText("name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "embra" } });
    expect(input.value).toBe("embra");

    const async$ = writable(0);
    const asyncHook = renderHook(() => useValue(async$, { sync: false }));
    expect(asyncHook.result.current).toBe(0);

    act(() => {
      async$.set(1);
      async$.set(2);
    });
    // Microtask not flushed yet
    expect(asyncHook.result.current).toBe(0);

    await act(async () => {
      await Promise.resolve();
    });
    expect(asyncHook.result.current).toBe(2);
  });

  it("does not resubscribe when inline options object is passed on re-render", () => {
    const v$ = writable(1);
    const subscribeSpy = vi.spyOn(v$, "subscribe");

    const { rerender } = renderHook(
      ({ tick }) => {
        void tick;
        return useValue(v$, { sync: true });
      },
      { initialProps: { tick: 0 } },
    );

    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    rerender({ tick: 1 });
    rerender({ tick: 2 });
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
  });

  it("prevents tearing when source changes between render and subscribe", () => {
    const v$ = writable(1);

    function Child() {
      const value = useValue(v$);
      return <span>{value}</span>;
    }

    function MutatorDuringParentLayoutEffect() {
      useLayoutEffect(() => {
        v$.set(2);
      }, []);
      return <Child />;
    }

    const { container } = render(<MutatorDuringParentLayoutEffect />);
    expect(container.textContent).toBe("2");
  });

  it("works cleanly under React.StrictMode", () => {
    const v$ = writable(1);
    const { result } = renderHook(() => useValue(v$), { wrapper: StrictMode });
    expect(result.current).toBe(1);

    act(() => v$.set(2));
    expect(result.current).toBe(2);
  });
});
