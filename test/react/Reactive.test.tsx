// @vitest-environment jsdom

import { type Readable, writable } from "@embra/reactivity";
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Reactive } from "../../src/react";

afterEach(cleanup);

describe("Reactive", () => {
  it("isolates re-renders to the <Reactive> boundary when passed a render function", () => {
    const a$ = writable(1);
    const b$ = writable(2);
    const parentRender = vi.fn();

    function Parent() {
      parentRender();
      return (
        <div>
          <Reactive>{() => <span>{a$.value + b$.value}</span>}</Reactive>
        </div>
      );
    }

    const { container } = render(<Parent />);
    expect(container.textContent).toBe("3");
    expect(parentRender).toHaveBeenCalledTimes(1);

    act(() => a$.set(10));
    expect(container.textContent).toBe("12");
    expect(parentRender).toHaveBeenCalledTimes(1);
  });

  it("supports passing a Readable directly and switching between function and Readable", () => {
    const count$ = writable<ReactNode>("hello");

    function Host({ source }: { source: (() => ReactNode) | Readable<ReactNode> }) {
      return (
        <Reactive name="region" equal={Object.is}>
          {source}
        </Reactive>
      );
    }

    const { container, rerender } = render(<Host source={count$} />);
    expect(container.textContent).toBe("hello");

    act(() => count$.set("world"));
    expect(container.textContent).toBe("world");

    rerender(<Host source={() => `fn:${count$.value}`} />);
    expect(container.textContent).toBe("fn:world");

    act(() => count$.set("embra"));
    expect(container.textContent).toBe("fn:embra");
  });

  it("supports sync: false on <Reactive>", async () => {
    const count$ = writable(0);
    const { container } = render(<Reactive sync={false}>{() => count$.value}</Reactive>);
    expect(container.textContent).toBe("0");

    act(() => count$.set(5));
    expect(container.textContent).toBe("0");

    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toBe("5");
  });
});
