import { describe, expect, it, vi } from "vitest";

import { writable, PromiseScheduler, SyncScheduler } from "../../src";

describe("scheduler", () => {
  it("should only unsubscribe the given subscriber with the given scheduler", async () => {
    const a = writable(1);
    const spy = vi.fn();
    a.reaction(spy, PromiseScheduler);
    a.reaction(spy); // sync

    expect(spy).toBeCalledTimes(0);

    a.set(2);
    expect(spy).toBeCalledTimes(1);
    expect(spy).lastCalledWith(2);

    await Promise.resolve();
    expect(spy).toBeCalledTimes(2);
    expect(spy).lastCalledWith(2);

    spy.mockClear();

    a.unsubscribe(spy, SyncScheduler);

    a.set(3);
    expect(spy).toBeCalledTimes(0);

    await Promise.resolve();
    expect(spy).toBeCalledTimes(1);
    expect(spy).lastCalledWith(3);

    spy.mockClear();

    a.unsubscribe(spy, PromiseScheduler);

    a.set(3);
    expect(spy).toBeCalledTimes(0);

    await Promise.resolve();
    expect(spy).toBeCalledTimes(0);
  });

  it("should unsubscribe the given subscriber with all schedulers when scheduler is not given", async () => {
    const a = writable(1);
    const spy = vi.fn();
    a.reaction(spy, PromiseScheduler);
    a.reaction(spy); // sync

    expect(spy).toBeCalledTimes(0);

    a.set(2);
    expect(spy).toBeCalledTimes(1);
    expect(spy).lastCalledWith(2);

    await Promise.resolve();
    expect(spy).toBeCalledTimes(2);
    expect(spy).lastCalledWith(2);

    spy.mockClear();

    a.unsubscribe(spy);
    a.set(3);
    expect(spy).toBeCalledTimes(0);

    await Promise.resolve();
    expect(spy).toBeCalledTimes(0);
  });
});
