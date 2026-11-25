// @vitest-environment jsdom

import { type Readable, writable } from "@embra/reactivity";
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDerivedValue } from "../../src/react";

afterEach(cleanup);

describe("useDerivedValue", () => {
  it("derives from a single Readable with a pure transform", () => {
    const count$ = writable(2);
    const { result } = renderHook(() => useDerivedValue(count$, (n) => n * 3));

    expect(result.current).toBe(6);

    act(() => count$.set(5));
    expect(result.current).toBe(15);
  });

  it("derives from an inline array of Readables without recreating node on unrelated re-renders", () => {
    const a$ = writable(1);
    const b$ = writable(2);
    const compute = vi.fn((a: number, b: number) => a + b);

    const { result, rerender } = renderHook(
      ({ tick }) => {
        void tick;
        return useDerivedValue([a$, b$], compute);
      },
      { initialProps: { tick: 0 } },
    );

    expect(result.current).toBe(3);
    expect(compute).toHaveBeenCalledTimes(1);

    rerender({ tick: 1 });
    rerender({ tick: 2 });
    expect(compute).toHaveBeenCalledTimes(1);

    act(() => a$.set(10));
    expect(result.current).toBe(12);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("handles changing source references, array length, and single <-> array switches cleanly", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const a$ = writable(1);
    const b$ = writable(2);
    const c$ = writable(3);

    const { result, rerender } = renderHook(
      ({ sources }: { sources: Readable<number> | readonly Readable<number>[] }) =>
        useDerivedValue(sources as any, (...vals: number[]) =>
          Array.isArray(sources) ? vals.reduce((acc, v) => acc + v, 0) : vals[0] * 10,
        ),
      { initialProps: { sources: [a$, b$] as Readable<number> | readonly Readable<number>[] } },
    );

    expect(result.current).toBe(3);

    rerender({ sources: [a$, b$, c$] });
    expect(result.current).toBe(6);

    act(() => c$.set(10));
    expect(result.current).toBe(13);

    rerender({ sources: a$ });
    expect(result.current).toBe(10);

    act(() => a$.set(4));
    expect(result.current).toBe(40);

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("uses fresh props closure and supports equal, sync: false, and StrictMode", async () => {
    const num$ = writable(3);
    const { result, rerender } = renderHook(
      ({ offset }) =>
        useDerivedValue(num$, (n) => n + offset, {
          name: "withOffset",
          equal: Object.is,
          sync: false,
        }),
      { initialProps: { offset: 10 }, wrapper: StrictMode },
    );

    expect(result.current).toBe(13);

    rerender({ offset: 20 });
    expect(result.current).toBe(23);

    act(() => num$.set(5));
    expect(result.current).toBe(23);

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(25);
  });

  it("supports null and undefined as single or array sources", () => {
    const a$ = writable(2);
    const b$ = writable(10);

    const singleUndef = renderHook(() => useDerivedValue(undefined, (v) => v ?? 99));
    expect(singleUndef.result.current).toBe(99);

    const singleNull = renderHook(() => useDerivedValue(null, (v) => (v === null ? "nil" : "val")));
    expect(singleNull.result.current).toBe("nil");

    const { result, rerender } = renderHook(
      ({ maybe }: { maybe: Readable<number> | undefined }) =>
        useDerivedValue([a$, maybe] as const, (x, y) => x + (y ?? 0)),
      { initialProps: { maybe: undefined as Readable<number> | undefined } },
    );
    expect(result.current).toBe(2);

    rerender({ maybe: b$ });
    expect(result.current).toBe(12);

    act(() => b$.set(20));
    expect(result.current).toBe(22);

    rerender({ maybe: undefined });
    expect(result.current).toBe(2);
  });
});
