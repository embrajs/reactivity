// @vitest-environment jsdom

import { writable } from "@embra/reactivity";
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWatch } from "../../src/react";

afterEach(cleanup);

describe("useWatch", () => {
  it("runs asynchronously by default and cleans up on unmount", async () => {
    const count$ = writable(0);
    const seen: number[] = [];
    const cleanupSpy = vi.fn();

    const { rerender, unmount } = renderHook(
      ({ label }) => {
        void label;
        useWatch(() => {
          seen.push(count$.value);
          return cleanupSpy;
        });
      },
      { initialProps: { label: "a" } },
    );

    expect(seen).toEqual([0]);

    // Unrelated re-render does not restart watcher when deps are omitted
    rerender({ label: "b" });
    expect(seen).toEqual([0]);
    expect(cleanupSpy).not.toHaveBeenCalled();

    act(() => {
      count$.set(1);
      count$.set(2);
    });
    expect(seen).toEqual([0]);

    await act(async () => {
      await Promise.resolve();
    });
    expect(seen).toEqual([0, 2]);
    expect(cleanupSpy).toHaveBeenCalledTimes(1);

    unmount();
    expect(cleanupSpy).toHaveBeenCalledTimes(2);

    act(() => count$.set(3));
    await act(async () => {
      await Promise.resolve();
    });
    expect(seen).toEqual([0, 2]);
  });

  it("supports sync: true option and this.dispose() inside effect", () => {
    const count$ = writable(1);
    const seen: number[] = [];

    renderHook(() =>
      useWatch(
        function () {
          seen.push(count$.value);
          if (count$.value >= 2) {
            this.dispose();
          }
          return undefined;
        },
        { sync: true },
      ),
    );

    expect(seen).toEqual([1]);

    act(() => count$.set(2));
    expect(seen).toEqual([1, 2]);

    act(() => count$.set(3));
    expect(seen).toEqual([1, 2]);
  });

  it("restarts when deps change (including length changes) and uses latest effect closure", () => {
    const count$ = writable(1);
    const seen: string[] = [];
    const cleanupSpy = vi.fn();

    const { rerender } = renderHook(
      ({ deps }: { deps?: number[] }) => {
        useWatch(
          () => {
            seen.push(`${deps ? deps.join(",") : "none"}:${count$.value}`);
            return cleanupSpy;
          },
          (deps ?? { sync: true }) as number[],
          deps !== undefined ? { sync: true } : undefined,
        );
      },
      { initialProps: { deps: [1] as number[] | undefined } },
    );

    expect(seen).toEqual(["1:1"]);

    // Same deps array values do not restart
    rerender({ deps: [1] });
    expect(seen).toEqual(["1:1"]);
    expect(cleanupSpy).not.toHaveBeenCalled();

    // Changed deps value restarts
    rerender({ deps: [2] });
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["1:1", "2:1"]);

    // Changed deps length restarts
    rerender({ deps: [2, 3] });
    expect(cleanupSpy).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(["1:1", "2:1", "2,3:1"]);

    // Switching deps -> undefined restarts cleanly
    rerender({ deps: undefined });
    expect(cleanupSpy).toHaveBeenCalledTimes(3);
    expect(seen).toEqual(["1:1", "2:1", "2,3:1", "none:1"]);

    act(() => count$.set(5));
    expect(seen).toEqual(["1:1", "2:1", "2,3:1", "none:1", "none:5"]);
  });

  it("handles React.StrictMode double mount/cleanup", () => {
    const count$ = writable(1);
    const active = vi.fn();
    const cleaned = vi.fn();

    const { unmount } = renderHook(
      () =>
        useWatch(
          () => {
            active(count$.value);
            return cleaned;
          },
          { sync: true },
        ),
      { wrapper: StrictMode },
    );

    expect(active).toHaveBeenCalledTimes(2);
    expect(cleaned).toHaveBeenCalledTimes(1);

    act(() => count$.set(2));
    expect(active).toHaveBeenCalledTimes(3);
    expect(active).toHaveBeenLastCalledWith(2);

    unmount();
    expect(cleaned).toHaveBeenCalledTimes(3);
  });
});
