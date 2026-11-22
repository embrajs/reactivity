// @vitest-environment jsdom

import { reactiveMap, writable } from "@embra/reactivity";
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode, startTransition, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useComputedValue } from "../../src/react";

afterEach(cleanup);

describe("useComputedValue", () => {
  it("tracks multiple sources and conditional branches dynamically", () => {
    const flag$ = writable(true);
    const a$ = writable(1);
    const b$ = writable(10);
    const computeSpy = vi.fn(() => (flag$.value ? a$.value : b$.value));

    const { result } = renderHook(() => useComputedValue(computeSpy));
    expect(result.current).toBe(1);
    expect(computeSpy).toHaveBeenCalledTimes(1);

    // b$ is not tracked while flag$ is true
    act(() => b$.set(20));
    expect(result.current).toBe(1);
    expect(computeSpy).toHaveBeenCalledTimes(1);

    // Switch branch
    act(() => flag$.set(false));
    expect(result.current).toBe(20);

    // a$ is no longer tracked
    const callsBeforeA = computeSpy.mock.calls.length;
    act(() => a$.set(99));
    expect(computeSpy).toHaveBeenCalledTimes(callsBeforeA);

    act(() => b$.set(30));
    expect(result.current).toBe(30);
  });

  it("supports fine-grained reactiveMap.get(id) tracking and fresh props closures", () => {
    const map = reactiveMap([
      ["a", 1],
      ["b", 2],
    ]);
    const renderSpy = vi.fn();

    const { result, rerender } = renderHook(
      ({ id, multiplier }) => {
        renderSpy();
        return useComputedValue(() => (map.get(id) ?? 0) * multiplier);
      },
      { initialProps: { id: "a", multiplier: 1 } },
    );

    expect(result.current).toBe(1);
    expect(renderSpy).toHaveBeenCalledTimes(1);

    // Unrelated key update does not trigger re-render
    act(() => map.set("b", 20));
    expect(renderSpy).toHaveBeenCalledTimes(1);

    // Tracked key update triggers re-render
    act(() => map.set("a", 5));
    expect(result.current).toBe(5);
    expect(renderSpy).toHaveBeenCalledTimes(2);

    // Props change immediately updates computed value and dependency
    rerender({ id: "b", multiplier: 10 });
    expect(result.current).toBe(200);

    act(() => map.set("b", 3));
    expect(result.current).toBe(30);
  });

  it("supports equal, sync: false, and name options", async () => {
    const count$ = writable(1);
    const equalSpy = vi.fn((a: { odd: boolean }, b: { odd: boolean }) => a.odd === b.odd);

    const { result } = renderHook(() =>
      useComputedValue(() => ({ odd: count$.value % 2 === 1 }), {
        name: "parity",
        equal: equalSpy,
        sync: false,
      }),
    );

    expect(result.current).toEqual({ odd: true });

    act(() => count$.set(3));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ odd: true });

    act(() => count$.set(4));
    expect(result.current).toEqual({ odd: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ odd: false });
  });

  it("is safe under StrictMode and concurrent startTransition", () => {
    const base$ = writable(2);

    const { result } = renderHook(
      () => {
        const [factor, setFactor] = useState(1);
        const value = useComputedValue(() => base$.value * factor);
        return { value, setFactor };
      },
      { wrapper: StrictMode },
    );

    expect(result.current.value).toBe(2);

    act(() => {
      startTransition(() => {
        result.current.setFactor(5);
      });
    });
    expect(result.current.value).toBe(10);

    act(() => base$.set(3));
    expect(result.current.value).toBe(15);
  });
});
