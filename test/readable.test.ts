import { afterEach, describe, expect, it, vi } from "vitest";
import { type Owned, readable, type Writable } from "../src/reactivity";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readable", () => {
  it("returns a readable and an independent setter", () => {
    const [source, set] = readable(0);
    expect(source.get()).toBe(0);

    set(1);
    expect(source.get()).toBe(1);
  });

  it("disables public writes while preserving the returned setter", () => {
    const [source, set] = readable(0);
    const writableView = source as Owned<Writable<number>>;

    writableView.set(1);
    writableView.value = 2;
    expect(source.get()).toBe(0);

    set(3);
    expect(source.get()).toBe(3);
  });

  it("notifies subscriptions when the returned setter writes", async () => {
    const [source, set] = readable(0);
    const spy = vi.fn();
    source.subscribe(spy);

    set(1);
    expect(spy.mock.calls).toEqual([[0]]);
    await Promise.resolve();
    expect(spy.mock.calls).toEqual([[0], [1]]);
  });

  it("forwards equality options to the underlying value", () => {
    const [source, set] = readable(0, { equal: (a, b) => a % 10 === b % 10 });

    set(10);
    expect(source.get()).toBe(0);
    set(11);
    expect(source.get()).toBe(11);
  });

  it("disposes the value updated by the returned setter", () => {
    const [source, set] = readable(0);
    vi.spyOn(console, "error").mockImplementation(() => {});

    source.dispose();
    expect(() => set(1)).toThrow("disposed");
    expect(source.get()).toBe(0);
  });
});
