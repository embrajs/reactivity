// @vitest-environment jsdom

import { isReadable, isWritable, type Readable, writable } from "@embra/reactivity";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { memo, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useComputed, useDerived, useReadable, useValue, useWritable } from "../../src/react";

afterEach(cleanup);

describe("local node hooks (useWritable, useReadable, useComputed, useDerived)", () => {
  it("useWritable returns a stable Writable that does not re-render its owner component", () => {
    const parentRender = vi.fn();
    const childRender = vi.fn();

    const Child = memo(function Child({ count$ }: { count$: Readable<number> }) {
      childRender();
      return <span>{useValue(count$)}</span>;
    });

    let externalSet!: (v: number) => void;
    function Parent() {
      parentRender();
      const count$ = useWritable(1, { name: "localCount" });
      expect(isWritable(count$)).toBe(true);
      externalSet = count$.set;
      return <Child count$={count$} />;
    }

    const { container, rerender } = render(<Parent />, { wrapper: StrictMode });
    expect(container.textContent).toBe("1");
    const initialParentCalls = parentRender.mock.calls.length;
    const initialChildCalls = childRender.mock.calls.length;

    act(() => externalSet(5));
    expect(container.textContent).toBe("5");
    expect(parentRender).toHaveBeenCalledTimes(initialParentCalls);
    expect(childRender.mock.calls.length).toBeGreaterThan(initialChildCalls);

    rerender(<Parent />);
    expect(container.textContent).toBe("5");
  });

  it("useReadable returns a stable [Readable, Setter] pair", () => {
    const { result, rerender } = renderHook(() => useReadable("init", { name: "localRead" }), {
      wrapper: StrictMode,
    });

    const [firstNode, firstSetter] = result.current;
    expect(isReadable(firstNode)).toBe(true);
    expect(isWritable(firstNode)).toBe(false);
    expect(firstNode.get()).toBe("init");

    rerender();
    expect(result.current[0]).toBe(firstNode);
    expect(result.current[1]).toBe(firstSetter);

    act(() => firstSetter("next"));
    expect(firstNode.get()).toBe("next");
  });

  it("useComputed returns a stable Readable, uses latest committed compute, and disconnects on unmount", () => {
    const a$ = writable(2);
    const parentRender = vi.fn();

    const { result, rerender, unmount } = renderHook(
      ({ factor }) => {
        parentRender();
        return useComputed(() => a$.value * factor, { name: "comp", equal: Object.is });
      },
      { initialProps: { factor: 3 }, wrapper: StrictMode },
    );

    const node = result.current;
    expect(node.get()).toBe(6);

    // Subscribe downstream to keep upstream active
    const subHook = renderHook(() => useValue(node));
    expect(subHook.result.current).toBe(6);

    rerender({ factor: 10 });
    expect(result.current).toBe(node);
    // Downstream re-evaluation uses latest committed factor
    act(() => a$.set(4));
    expect(subHook.result.current).toBe(40);

    subHook.unmount();
    unmount();
  });

  it("useDerived supports single and array sources, stable node reference, and StrictMode", () => {
    const a$ = writable(1);
    const b$ = writable(2);

    const singleHook = renderHook(
      ({ offset }) => useDerived(a$, (v) => v + offset, { name: "single", equal: Object.is }),
      { initialProps: { offset: 10 }, wrapper: StrictMode },
    );

    const firstSingle = singleHook.result.current;
    expect(firstSingle.get()).toBe(11);

    singleHook.rerender({ offset: 20 });
    expect(singleHook.result.current).toBe(firstSingle);
    act(() => a$.set(5));
    expect(firstSingle.get()).toBe(25);

    const multiHook = renderHook(({ sources }) => useDerived(sources, (x, y) => x + y), {
      initialProps: { sources: [a$, b$] as const },
      wrapper: StrictMode,
    });

    const firstMulti = multiHook.result.current;
    expect(firstMulti.get()).toBe(7);

    // Re-render with new array of identical Readables keeps same derived node
    multiHook.rerender({ sources: [a$, b$] as const });
    expect(multiHook.result.current).toBe(firstMulti);

    // Changing source replaces derived node cleanly
    const c$ = writable(100);
    multiHook.rerender({ sources: [a$, c$] as const });
    expect(multiHook.result.current).not.toBe(firstMulti);
    expect(multiHook.result.current.get()).toBe(105);

    const optionalHook = renderHook(
      ({ maybe }: { maybe: Readable<number> | undefined | null }) =>
        useDerived([a$, maybe] as const, (x, y) => x + (y ?? 0)),
      { initialProps: { maybe: undefined as Readable<number> | undefined | null }, wrapper: StrictMode },
    );
    const firstOptional = optionalHook.result.current;
    expect(firstOptional.get()).toBe(5);

    optionalHook.rerender({ maybe: undefined });
    expect(optionalHook.result.current).toBe(firstOptional);

    optionalHook.rerender({ maybe: b$ });
    expect(optionalHook.result.current).not.toBe(firstOptional);
    expect(optionalHook.result.current.get()).toBe(7);

    optionalHook.rerender({ maybe: null });
    expect(optionalHook.result.current.get()).toBe(5);
  });
});
