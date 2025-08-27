// @vitest-environment jsdom

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { derive, reactiveMap, type Readable, type ReadonlyReactiveMap, writable } from "../../src";
import { useValue } from "../../src/react";

describe("useValue", () => {
  it("should get value from Readable", () => {
    const v$ = writable(1);
    const { result } = renderHook(() => useValue(v$));

    expect(result.current).toBe(1);
  });

  it("should return the value if it is not a Readable", () => {
    const { result, unmount } = renderHook(() => useValue(1));

    expect(result.current).toBe(1);

    unmount();
  });

  it("should support switching between value and Readable", () => {
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
    const v$ = writable("a");
    const { result } = renderHook(() => useValue(v$));

    expect(result.current).toBe("a");

    act(() => v$.set("b"));

    expect(result.current).toBe("b");
  });

  it("should support function as value", () => {
    const v$ = writable((): boolean => true);
    const { result } = renderHook(() => useValue(v$));

    expect(result.current).toBe(v$.value);

    const fn = result.current;

    act(() => v$.set(() => false));

    expect(result.current).toBe(v$.value);
    expect(result.current).not.toBe(fn);
  });

  describe("should get correct value after v$ changes", () => {
    it("v$ -> undefined", () => {
      const v$ = writable(1);
      const { result: result1 } = renderHook(() => useValue(v$));
      expect(result1.current).toBe(1);

      const { result: result2 } = renderHook(() => useValue(undefined));
      expect(result2.current).toBeUndefined();
    });

    it("undefined -> v$", () => {
      const { result: result1 } = renderHook(() => useValue(undefined));
      expect(result1.current).toBeUndefined();

      const v$ = writable(1);
      const { result: result2 } = renderHook(() => useValue(v$));
      expect(result2.current).toBe(1);
    });

    it("v1$ -> v2$", () => {
      const v1$ = writable(1);
      const { result: result1 } = renderHook(() => useValue(v1$));
      expect(result1.current).toBe(1);

      const v2$ = writable(2);
      const { result: result2 } = renderHook(() => useValue(v2$));
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
    const v$ = writable(1);
    let renderingCount = 0;
    const { result } = renderHook(() => {
      renderingCount += 1;
      return useValue(v$);
    });

    act(() => v$.set(1));
    act(() => v$.set(1));
    act(() => v$.set(1));

    expect(result.current).toBe(1);

    expect(renderingCount).toBe(1);

    act(() => v$.set(2));

    expect(result.current).toBe(2);

    expect(renderingCount).toBe(2);
  });

  it("should not trigger extra rendering on same value", () => {
    const v$ = writable({ a: 1 }, { equal: (a, b) => a.a === b.a });
    let renderingCount = 0;
    const { result } = renderHook(() => {
      renderingCount += 1;
      return useValue(v$);
    });

    act(() => v$.set({ a: 1 }));
    act(() => v$.set({ a: 1 }));
    act(() => v$.set({ a: 1 }));

    expect(result.current).toEqual({ a: 1 });

    expect(renderingCount).toBe(1);

    act(() => v$.set({ a: 2 }));

    expect(result.current).toEqual({ a: 2 });

    expect(renderingCount).toBe(2);
  });

  it("should trigger extra rendering if value changes before initial rendering", () => {
    const v$ = writable(1);
    let renderingCount = 0;
    const { result } = renderHook(() => {
      renderingCount += 1;
      const value = useValue(v$);
      v$.set(2);
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
