// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { type Readable, writable } from "../../src";
import { useDerived } from "../../src/react";

describe("useDerived", () => {
  it("should get derived value from Readable", () => {
    const v$ = writable(1);
    const { result } = renderHook(() => useDerived(v$, value => value + 1));

    expect(result.current).toBe(2);
  });

  it("should return undefined if no Readable provided", () => {
    // @ts-expect-error not Readable
    renderHook(() => useDerived(undefined, value => value + 1));

    let v: Readable<number> | undefined;
    const { result } = renderHook(() => useDerived(v, value => value + 1));

    expect(result.current).toBeUndefined();
  });

  it("should update after value changes", () => {
    const v$ = writable("a");
    const { result } = renderHook(() => useDerived(v$, letter => `#${letter}`));

    expect(result.current).toBe("#a");

    act(() => v$.set("b"));

    expect(result.current).toBe("#b");
  });

  it("should support function as value", () => {
    const v$ = writable((): string => "a");
    const { result } = renderHook(() => useDerived(v$, fn => () => `#${fn()}`));

    expect(result.current()).toBe("#a");

    act(() => v$.set(() => "b"));

    expect(result.current()).toBe("#b");
  });

  it("should not trigger extra rendering on initial value", () => {
    const v$ = writable(1);
    let renderingCount = 0;
    const { result } = renderHook(() => {
      renderingCount += 1;
      return useDerived(v$, value => value + 1);
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
      const value = useDerived(v$, () => ({ value: "value" }), {
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
      return useDerived(v$, value => value.a % 2);
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
      const value = useDerived(v$, value => ({ value: value + 1 }));
      v$.set(2);
      return value;
    });

    expect(result.current).toEqual({ value: 3 });
    expect(renderingCount).toBe(2);
  });
});
