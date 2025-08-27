// @vitest-environment jsdom

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { writable } from "../../src";
import { useCombined } from "../../src/react";

describe("useCombined", () => {
  it("should get useCombined value from Readables", () => {
    const v$ = writable(1);
    const { result } = renderHook(() => useCombined([v$], ([value]) => value + 1));

    expect(result.current).toBe(2);
  });

  it("should get useCombined value from Readables without transform", () => {
    const v1$ = writable(1);
    const v2$ = writable(10);
    const { result } = renderHook(() => useCombined([v1$, v2$]));

    expect(result.current).toEqual([1, 10]);

    act(() => v1$.set(2));
    act(() => v2$.set(20));

    expect(result.current).toEqual([2, 20]);
  });

  it("should update after value changes", () => {
    const v1$ = writable("a1");
    const v2$ = writable("a2");
    const { result } = renderHook(() => useCombined([v1$, v2$], ([v1, v2]) => `#${v1}-${v2}`));

    expect(result.current).toBe("#a1-a2");

    act(() => v1$.set("b1"));

    expect(result.current).toBe("#b1-a2");
  });

  it("should support function as value", () => {
    const v1$ = writable((): string => "a1");
    const v2$ = writable((): string => "a2");
    const { result } = renderHook(() =>
      useCombined(
        [v1$, v2$],
        ([fn1, fn2]) =>
          () =>
            `#${fn1()}-${fn2()}`,
      ),
    );

    expect(result.current()).toBe("#a1-a2");

    act(() => v1$.set(() => "b1"));

    expect(result.current()).toBe("#b1-a2");
  });

  it("should not trigger extra rendering on initial value", () => {
    const v$ = writable(1);
    let renderingCount = 0;
    const { result } = renderHook(() => {
      renderingCount += 1;
      return useCombined([v$], ([value]) => value + 1);
    });

    act(() => v$.set(1));
    act(() => v$.set(1));
    act(() => v$.set(1));

    expect(result.current).toBe(2);

    expect(renderingCount).toBe(1);

    act(() => v$.set(2));

    expect(result.current).toBe(3);

    expect(renderingCount).toBe(2);
  });

  it("should ignore comparing if equal is false", () => {
    const v$ = writable(1);
    let renderingCount = 0;
    const { result } = renderHook(() => {
      renderingCount += 1;
      const value = useCombined([v$], () => ({ value: "value" }), {
        equal: false,
      });
      return value;
    });

    expect(result.current).toEqual({ value: "value" });
    expect(renderingCount).toBe(1);

    act(() => v$.set(2));

    expect(result.current).toEqual({ value: "value" });
    expect(renderingCount).toBe(2);
  });

  it("should not trigger extra rendering on same value", () => {
    const v$ = writable({ a: 1 });
    let renderingCount = 0;
    const { result } = renderHook(() => {
      renderingCount += 1;
      return useCombined([v$], ([value]) => value.a % 2);
    });

    act(() => v$.set({ a: 1 }));
    act(() => v$.set({ a: 1 }));
    act(() => v$.set({ a: 1 }));

    expect(result.current).toBe(1);

    expect(renderingCount).toBe(1);

    act(() => v$.set({ a: 2 }));

    expect(result.current).toBe(0);

    expect(renderingCount).toBe(2);
  });

  it("should trigger extra rendering if value changes before initial rendering", () => {
    const v$ = writable(1);
    let renderingCount = 0;
    const { result } = renderHook(() => {
      renderingCount += 1;
      const value = useCombined([v$], ([value]) => ({ value: value + 1 }));
      v$.set(2);
      return value;
    });

    expect(result.current).toEqual({ value: 3 });
    expect(renderingCount).toBe(2);
  });
});
