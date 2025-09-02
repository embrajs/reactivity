import { describe, expect, it, vi } from "vitest";

import { writable, PromiseScheduler } from "../../src";

describe("PromiseScheduler", () => {
  it("should schedule reactions asynchronously", async () => {
    const a = writable(1);
    const spy = vi.fn();
    a.subscribe(spy, PromiseScheduler);

    expect(spy).toBeCalledTimes(1);
    expect(spy).lastCalledWith(1);

    a.set(2);
    expect(spy).toBeCalledTimes(1);

    await Promise.resolve();
    expect(spy).toBeCalledTimes(2);
    expect(spy).lastCalledWith(2);
  });
});
