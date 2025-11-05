import { describe, expect, it, vi } from "vitest";

import {
  arrayShallowEqual,
  compute,
  isReadable,
  isWritable,
  readable,
  strictEqual,
  unsubscribe,
  writable,
  isReadableLike,
  isReadableProvider,
} from "../src";

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

  describe("isWritable", () => {
    it("should return true for Writable instances", () => {
      const a = writable("a");
      expect(isWritable(a)).toBe(true);
    });

    it("should return false for Readable instances", () => {
      const [b] = readable("b");
      expect(isWritable(b)).toBe(false);
    });

    it("should return false for non-Readable/Writable instances", () => {
      const notReadable = { value: "not readable" };
      expect(isWritable(notReadable)).toBe(false);
      expect(isWritable(undefined)).toBe(false);
    });
  });

  describe("isReadableProvider", () => {
    it("should return true for ReadableProvider instances", () => {
      const a = writable("a");
      const provider = { $: a };
      expect(isReadableProvider(provider)).toBe(true);
    });

    it("should return false for Readable instances", () => {
      const a = writable("a");
      expect(isReadableProvider(a)).toBe(false);
    });

    it("should return false for objects without $ property", () => {
      const notProvider = { value: "not a provider" };
      expect(isReadableProvider(notProvider)).toBe(false);
    });

    it("should return false for objects with $ property that is not Readable", () => {
      const notProvider = { $: "not readable" };
      expect(isReadableProvider(notProvider)).toBe(false);
    });

    it("should return false for null and undefined", () => {
      expect(isReadableProvider(null)).toBe(false);
      expect(isReadableProvider(undefined)).toBe(false);
    });

    it("should return false for primitive values", () => {
      expect(isReadableProvider(42)).toBe(false);
      expect(isReadableProvider("string")).toBe(false);
      expect(isReadableProvider(true)).toBe(false);
    });
  });

  describe("isReadableLike", () => {
    it("should return true for ReadableLike instances", () => {
      const a = writable("a");
      const provider = { $: a };
      expect(isReadableLike(a)).toBe(true);
      expect(isReadableLike(provider)).toBe(true);
    });

    it("should return true for Readable instances", () => {
      const a = writable("a");
      expect(isReadableLike(a)).toBe(true);

      const [b] = readable("b");
      expect(isReadableLike(b)).toBe(true);
    });

    it("should return true for computed values", () => {
      const a = writable("a");
      const b = compute(get => get(a) + "b");
      expect(isReadableLike(b)).toBe(true);
    });

    it("should return true for ReadableProvider instances", () => {
      const a = writable("a");
      const provider = { $: a };
      expect(isReadableLike(provider)).toBe(true);
    });

    it("should return false for objects without $ property that are not Readable", () => {
      const notReadableLike = { value: "not readable" };
      expect(isReadableLike(notReadableLike)).toBe(false);
    });

    it("should return false for objects with $ property that is not Readable", () => {
      const notReadableLike = { $: "not readable" };
      expect(isReadableLike(notReadableLike)).toBe(false);
    });

    it("should return false for null and undefined", () => {
      expect(isReadableLike(null)).toBe(false);
      expect(isReadableLike(undefined)).toBe(false);
    });

    it("should return false for primitive values", () => {
      expect(isReadableLike(42)).toBe(false);
      expect(isReadableLike("string")).toBe(false);
      expect(isReadableLike(true)).toBe(false);
    });
  });
});
