import { describe, expect, it, vi } from "vitest";

import { writable, MicrotaskScheduler } from "../../src";

describe("MicrotaskScheduler", () => {
  it("should schedule reactions asynchronously", async () => {
    const a = writable(1);
    const spy = vi.fn();
    a.subscribe(spy, MicrotaskScheduler);

    expect(spy).toBeCalledTimes(1);
    expect(spy).lastCalledWith(1);

    a.set(2);
    expect(spy).toBeCalledTimes(1);

    await Promise.resolve();
    expect(spy).toBeCalledTimes(2);
    expect(spy).lastCalledWith(2);
  });

  it("should batch multiple updates in the same microtask", async () => {
    const a = writable(1);
    const spy = vi.fn();
    a.reaction(spy, MicrotaskScheduler);

    expect(spy).toBeCalledTimes(0);

    a.set(2);
    a.set(3);
    a.set(4);
    expect(spy).toBeCalledTimes(0);

    await Promise.resolve();
    expect(spy).toBeCalledTimes(1);
    expect(spy).lastCalledWith(4);
  });
});
