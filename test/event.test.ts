import { describe, expect, it, vi } from "vitest";

import { on, send, off, size } from "../src/event";

describe("event", () => {
  it("should send data to single listener", () => {
    const eventObject = {};
    const listener = vi.fn();

    on(eventObject, listener);
    send(eventObject, "test data");

    expect(listener).toBeCalledTimes(1);
    expect(listener).toBeCalledWith("test data");
  });

  it("should send data to multiple listeners", () => {
    const eventObject = {};
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    on(eventObject, listener1);
    on(eventObject, listener2);
    send(eventObject, "test data");

    expect(listener1).toBeCalledTimes(1);
    expect(listener1).toBeCalledWith("test data");
    expect(listener2).toBeCalledTimes(1);
    expect(listener2).toBeCalledWith("test data");
  });

  it("should return the correct size of listeners", () => {
    const eventObject: any = {};
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    expect(size(eventObject)).toBe(0);

    on(eventObject, listener1);
    expect(size(eventObject)).toBe(1);

    on(eventObject, listener2);
    expect(size(eventObject)).toBe(2);

    off(eventObject, listener1);
    expect(size(eventObject)).toBe(1);

    off(eventObject, listener2);
    expect(size(eventObject)).toBe(0);
  });

  it("should remove a single listener", () => {
    const eventObject: any = {};
    const listener = vi.fn();

    on(eventObject, listener);
    expect(off(eventObject, listener)).toBe(true);
    expect(size(eventObject)).toBe(0);

    // Trying to remove the same listener again should return false
    expect(off(eventObject, listener)).toBe(false);
  });

  it("should notify all listeners when some of them throw", () => {
    const eventObject: any = {};
    const listener1 = vi.fn(() => {
      throw new Error("Listener 1 error");
    });
    const listener2 = vi.fn();

    on(eventObject, listener1);
    on(eventObject, listener2);

    expect(() => send(eventObject, "test data")).toThrow("Listener 1 error");

    expect(listener1).toBeCalledTimes(1);
    expect(listener1).toBeCalledWith("test data");
    expect(listener2).toBeCalledTimes(1);
    expect(listener2).toBeCalledWith("test data");
  });
});
