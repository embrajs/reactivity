// @vitest-environment jsdom

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { derive, reactiveMap, type Readable, type ReadonlyReactiveMap, writable } from "../../src";
import { useValue } from "../../src/react";

describe("useValue", () => {
  it("should get value from val", () => {
    const val$ = writable(1);
    const { result } = renderHook(() => useValue(val$));

    expect(result.current).toBe(1);
  });

  it("should return the value if it is not a val", () => {
    const { result, unmount } = renderHook(() => useValue(1));

    expect(result.current).toBe(1);

    unmount();
  });

  it("should support switching between value and val", () => {
    const { result, rerender } = renderHook(({ count }) => useValue(count), {
      initialProps: { count: 1 } as { count: number | Readable<number> },
    });

    expect(result.current).toBe(1);

    const v$ = writable(2);

    rerender({ count: v$ });

    expect(result.current).toBe(2);

    act(() => v$.set(3));

    expect(result.current).toBe(3);

    rerender({ count: 4 });

    expect(result.current).toBe(4);

    rerender({ count: 5 });

    expect(result.current).toBe(5);
  });

  it("should render only once on props value changes", () => {
    const spyRender = vi.fn();

    const { result, rerender } = renderHook(
      ({ count }) => {
        spyRender();
        return useValue(count);
      },
      {
        initialProps: { count: 1 } as { count: number | Readable<number> },
      },
    );

    expect(result.current).toBe(1);
    expect(spyRender).toHaveBeenCalledTimes(1);

    rerender({ count: 2 });

    expect(result.current).toBe(2);
    expect(spyRender).toHaveBeenCalledTimes(2);

    rerender({ count: 2 });

    expect(result.current).toBe(2);
    expect(spyRender).toHaveBeenCalledTimes(3);
  });

  it("should update after value changes", () => {
    const val$ = writable("a");
    const { result } = renderHook(() => useValue(val$));

    expect(result.current).toBe("a");

    act(() => val$.set("b"));

    expect(result.current).toBe("b");
  });

  it("should support function as value", () => {
    const val$ = writable((): boolean => true);
    const { result } = renderHook(() => useValue(val$));

    expect(result.current).toBe(val$.value);

    const fn = result.current;

    act(() => val$.set(() => false));

    expect(result.current).toBe(val$.value);
    expect(result.current).not.toBe(fn);
  });

  describe("should get correct value after val$ changes", () => {
    it("val$ -> undefined", () => {
      const val$ = writable(1);
      const { result: result1 } = renderHook(() => useValue(val$));
      expect(result1.current).toBe(1);

      const { result: result2 } = renderHook(() => useValue(undefined));
      expect(result2.current).toBeUndefined();
    });

    it("undefined -> val$", () => {
      const { result: result1 } = renderHook(() => useValue(undefined));
      expect(result1.current).toBeUndefined();

      const val$ = writable(1);
      const { result: result2 } = renderHook(() => useValue(val$));
      expect(result2.current).toBe(1);
    });

    it("val1$ -> val2$", () => {
      const val1$ = writable(1);
      const { result: result1 } = renderHook(() => useValue(val1$));
      expect(result1.current).toBe(1);

      const val2$ = writable(2);
      const { result: result2 } = renderHook(() => useValue(val2$));
      expect(result2.current).toBe(2);
    });
  });

  it("should trigger re-render after reactive collections has changed", () => {
    const map$ = reactiveMap<string, number>();
    map$.set("foo", 1);

    const { result: result1 } = renderHook(() => {
      const map = useValue(map$.$);
      return map.get("foo");
    });

    expect(result1.current).toEqual(1);

    act(() => map$.set("foo", 2));
    const { result: result2 } = renderHook(() => {
      const map = useValue(map$.$);
      return map.get("foo");
    });

    expect(result2.current).toEqual(2);
    map$.dispose();
  });

  it("should not trigger extra rendering on initial value", () => {
    const val$ = writable(1);
    let renderingCount = 0;
    const { result } = renderHook(() => {
      renderingCount += 1;
      return useValue(val$);
    });

    act(() => val$.set(1));
    act(() => val$.set(1));
    act(() => val$.set(1));

    expect(result.current).toBe(1);

    expect(renderingCount).toBe(1);

    act(() => val$.set(2));

    expect(result.current).toBe(2);

    expect(renderingCount).toBe(2);
  });

  it("should not trigger extra rendering on same value", () => {
    const val$ = writable({ a: 1 }, { equal: (a, b) => a.a === b.a });
    let renderingCount = 0;
    const { result } = renderHook(() => {
      renderingCount += 1;
      return useValue(val$);
    });

    act(() => val$.set({ a: 1 }));
    act(() => val$.set({ a: 1 }));
    act(() => val$.set({ a: 1 }));

    expect(result.current).toEqual({ a: 1 });

    expect(renderingCount).toBe(1);

    act(() => val$.set({ a: 2 }));

    expect(result.current).toEqual({ a: 2 });

    expect(renderingCount).toBe(2);
  });

  it("should trigger extra rendering if value changes before initial rendering", () => {
    const val$ = writable(1);
    let renderingCount = 0;
    const { result } = renderHook(() => {
      renderingCount += 1;
      const value = useValue(val$);
      val$.set(2);
      return value;
    });

    expect(result.current).toBe(2);

    expect(renderingCount).toBe(2);
  });

  it("should trigger transform only once", () => {
    const map = reactiveMap<string, number>();
    map.set("foo", 1);

    const mockTransform = vi.fn((map: ReadonlyReactiveMap<string, number>) => new Set(map.values()));
    const derived$ = derive(map.$, mockTransform);

    expect(mockTransform).toHaveBeenCalledTimes(0);
    mockTransform.mockClear();

    renderHook(() => useValue(derived$));

    expect(mockTransform).toHaveBeenCalledTimes(1);
    mockTransform.mockClear();

    renderHook(() => useValue(derived$));

    const spy1 = vi.fn();
    derived$.subscribe(spy1);

    const spy2 = vi.fn();
    derived$.subscribe(spy2);

    const spy3 = vi.fn();
    derived$.subscribe(spy3);

    expect(mockTransform).toHaveBeenCalledTimes(0);

    derived$.dispose();
    map.dispose();
  });
});
