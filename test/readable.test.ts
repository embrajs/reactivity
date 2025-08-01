import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { compute, writable } from "../src";

describe("readable", () => {
  describe("unsubscribe", () => {
    it("should remove all subscribers", () => {
      const a = writable("a");
      const b = compute(get => get(a) + "b");

      const spyA = vi.fn();
      a.reaction(spyA);
      expect(spyA).toBeCalledTimes(0);

      const spyB = vi.fn();
      b.reaction(spyB);
      expect(spyB).toBeCalledTimes(0);

      a.value = "aa";
      expect(spyA).toBeCalledTimes(1);
      expect(spyA).lastCalledWith("aa");

      expect(spyB).toBeCalledTimes(1);
      expect(spyB).lastCalledWith("aab");

      spyA.mockClear();
      spyB.mockClear();

      a.unsubscribe();

      a.value = "aaa";
      expect(spyA).toBeCalledTimes(0);
      expect(spyB).toBeCalledTimes(1);
    });
  });

  describe.each(["test", "production"])("dispose [%s]", NODE_ENV => {
    const originalEnv = process.env.NODE_ENV;

    beforeAll(() => {
      process.env.NODE_ENV = NODE_ENV;
    });

    afterAll(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it("should log error when setting value after dispose", () => {
      const consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => void 0);

      expect(consoleErrorMock).not.toBeCalled();

      const a = writable("a");
      a.dispose();

      const spy = vi.fn();
      a.reaction(spy);

      a.value = "b";
      expect(consoleErrorMock).toBeCalled();
      expect(spy).toBeCalledTimes(1);

      consoleErrorMock.mockClear();
      spy.mockClear();

      consoleErrorMock.mockRestore();
    });

    it("should not subscribe to deps after dispose", () => {
      const a = writable("a");
      const b = compute(get => get(a) + "b");

      const spy = vi.fn();
      b.reaction(spy);

      b.dispose();

      a.value = "aa";
      expect(spy).toBeCalledTimes(0);
    });

    it("should be able to dispose multiple times", () => {
      const a = writable("a");
      a.dispose();
      a.dispose();
    });
  });

  describe("toJSON", () => {
    it("should return JSON representation of value", () => {
      const a = writable({ x: 1, y: 2 } as { x: number; y: number; toJSON?: () => { x: number; y: number } });
      expect(JSON.stringify(a)).toBe('{"x":1,"y":2}');

      a.value = { x: 3, y: 4, toJSON: () => ({ x: 5, y: 6 }) };
      expect(JSON.stringify(a)).toBe('{"x":5,"y":6}');
    });

    it("should handle undefined values", () => {
      const a = writable(undefined);
      expect(JSON.stringify(a)).toBeUndefined();
    });

    it("should handle null values", () => {
      const a = writable(null);
      expect(JSON.stringify(a)).toBe("null");
    });
  });
});
