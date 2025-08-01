import { describe, expect, it, vi } from "vitest";

import { arrayShallowEqual, compute, isReadable, readable, strictEqual, unsubscribe, writable } from "../src";

describe("utils", () => {
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

      unsubscribe([a, b]);

      a.value = "aaa";
      expect(spyA).toBeCalledTimes(0);
      expect(spyB).toBeCalledTimes(0);
    });

    it("should unsubscribe a specific subscriber", () => {
      const a = writable("a");
      const b = compute(get => get(a) + "b");

      const spyA1 = vi.fn();
      a.reaction(spyA1);
      expect(spyA1).toBeCalledTimes(0);

      const spyB1 = vi.fn();
      b.reaction(spyB1);
      expect(spyB1).toBeCalledTimes(0);

      a.value = "aa";
      expect(spyA1).toBeCalledTimes(1);
      expect(spyA1).lastCalledWith("aa");

      expect(spyB1).toBeCalledTimes(1);
      expect(spyB1).lastCalledWith("aab");

      unsubscribe(a, spyA1);

      a.value = "aaa";
      expect(spyA1).toBeCalledTimes(1);
      expect(spyB1).toBeCalledTimes(2);
    });
  });

  describe("strictEqual", () => {
    it("should return true for the same value", () => {
      const value = { a: 1 };
      expect(strictEqual(value, value)).toBe(true);
    });

    it("should return false for different values", () => {
      const value1 = { a: 1 };
      const value2 = { a: 1 };
      expect(strictEqual(value1, value2)).toBe(false);
    });
  });

  describe("arrayShallowEqual", () => {
    it("should return true for the same array", () => {
      const arr = [1, 2, 3];
      expect(arrayShallowEqual(arr, arr)).toBe(true);
    });

    it("should return false for different arrays", () => {
      const arr1 = [1, 2, 3];
      const arr2 = [1, 2, 4];
      expect(arrayShallowEqual(arr1, arr2)).toBe(false);
    });

    it("should return false for non-array values", () => {
      expect(arrayShallowEqual([1, 2], "not an array")).toBe(false);
    });

    it("should return true for equal arrays", () => {
      const arr1 = [1, 2, 3];
      const arr2 = [1, 2, 3];
      expect(arrayShallowEqual(arr1, arr2)).toBe(true);
    });

    it("should return false for arrays with different lengths", () => {
      const arr1 = [1, 2, 3];
      const arr2 = [1, 2];
      expect(arrayShallowEqual(arr1, arr2)).toBe(false);
    });

    it("should return false for arrays with different values", () => {
      const arr1 = [1, 2, 3];
      const arr2 = [1, 2, 4];
      expect(arrayShallowEqual(arr1, arr2)).toBe(false);
    });
  });

  describe("isReadable", () => {
    it("should return true for Readable instances", () => {
      const a = writable("a");
      expect(isReadable(a)).toBe(true);

      const [b] = readable("b");
      expect(isReadable(b)).toBe(true);
    });

    it("should return false for non-Readable instances", () => {
      const notReadable = { value: "not readable" };
      expect(isReadable(notReadable)).toBe(false);
    });
  });
});
