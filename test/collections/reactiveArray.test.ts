import { describe, it, expect, vi, afterAll, beforeAll } from "vitest";

import { batch, reactiveArray } from "../../src";

describe("ReactiveArray", () => {
  describe("constructor", () => {
    it("should create an empty array", () => {
      const arr = reactiveArray<number>();
      expect(arr.length).toBe(0);
    });

    it("should create an array with initial values", () => {
      const values = [1, 2, 3];
      const arr = reactiveArray(values);
      expect(arr.length).toBe(3);
      expect(arr[0]).toBe(1);
      expect(arr[1]).toBe(2);
      expect(arr[2]).toBe(3);
    });

    it("should create an array from null", () => {
      const arr = reactiveArray<number>(null);
      expect(arr.length).toBe(0);
    });
  });

  describe("set", () => {
    it("should set a value at an index", () => {
      const arr = reactiveArray<number>();
      arr.set(0, 1);
      expect(arr[0]).toBe(1);
      expect(arr.length).toBe(1);
    });

    it("should set a value with negative index", () => {
      const arr = reactiveArray([1, 2, 3]);
      arr.set(-1, 4);
      expect(arr[2]).toBe(4);
    });

    it("should notify on set", () => {
      const arr = reactiveArray([1]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.set(0, 2);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(arr);

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on set if setting same value", () => {
      const arr = reactiveArray([1]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.set(0, 1);

      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("setLength", () => {
    it("should set length", () => {
      const arr = reactiveArray([1, 2, 3]);
      arr.setLength(2);
      expect(arr.length).toBe(2);
      expect(arr[2]).toBe(undefined);
    });

    it("should notify on length change", () => {
      const arr = reactiveArray([1, 2, 3]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.setLength(2);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(arr);

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on length if setting same length", () => {
      const arr = reactiveArray([1, 2, 3]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.setLength(3);

      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("fill", () => {
    it("should fill array with value", () => {
      const arr = reactiveArray([1, 2, 3]);
      arr.fill(5);
      expect(arr[0]).toBe(5);
      expect(arr[1]).toBe(5);
      expect(arr[2]).toBe(5);
    });

    it("should fill array with partial range", () => {
      const arr = reactiveArray([1, 2, 3, 4]);
      arr.fill(5, 1, 3);
      expect(arr[0]).toBe(1);
      expect(arr[1]).toBe(5);
      expect(arr[2]).toBe(5);
      expect(arr[3]).toBe(4);
    });

    it("should notify on fill", () => {
      const arr = reactiveArray([1, 2, 3]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.fill(5);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(arr);

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on fill if array is empty", () => {
      const arr = reactiveArray<number>();

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.fill(5);

      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("push", () => {
    it("should push a value", () => {
      const arr = reactiveArray<number>();
      const length = arr.push(1);
      expect(arr.length).toBe(1);
      expect(arr[0]).toBe(1);
      expect(length).toBe(1);
    });

    it("should push multiple values", () => {
      const arr = reactiveArray<number>();
      const length = arr.push(1, 2, 3);
      expect(arr.length).toBe(3);
      expect(arr[0]).toBe(1);
      expect(arr[1]).toBe(2);
      expect(arr[2]).toBe(3);
      expect(length).toBe(3);
    });

    it("should notify on push", () => {
      const arr = reactiveArray<number>();

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.push(1);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(arr);

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on push if no items", () => {
      const arr = reactiveArray<number>();

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.push();

      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    describe("batchPush", () => {
      it("should push multiple values in batch", () => {
        const arr = reactiveArray<number>();
        batch(() => {
          arr.push(1);
          arr.push(2);
        });
        expect(arr[0]).toBe(1);
        expect(arr[1]).toBe(2);
        expect(arr.length).toBe(2);
      });

      it("should notify on batchPush", () => {
        const arr = reactiveArray<number>();

        const mockNotify = vi.fn();
        arr.$.reaction(mockNotify);

        const onDisposeValueSpy = vi.fn();
        arr.onDisposeValue(onDisposeValueSpy);

        batch(() => {
          arr.push(1);
          arr.push(2);
        });

        expect(mockNotify).toHaveBeenCalledTimes(1);
        expect(mockNotify).toHaveBeenCalledWith(arr);

        expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
      });
    });
  });

  describe("pop", () => {
    it("should pop a value", () => {
      const arr = reactiveArray([1, 2, 3]);
      const value = arr.pop();
      expect(value).toBe(3);
      expect(arr.length).toBe(2);
      expect(arr[2]).toBe(undefined);
    });

    it("should return undefined if array is empty", () => {
      const arr = reactiveArray<number>();
      const value = arr.pop();
      expect(value).toBe(undefined);
      expect(arr.length).toBe(0);
    });

    it("should notify on pop", () => {
      const arr = reactiveArray([1, 2, 3]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.pop();

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(arr);

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on pop if array is empty", () => {
      const arr = reactiveArray<number>();

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.pop();

      expect(mockNotify).not.toHaveBeenCalled();
      expect(onDisposeValueSpy).not.toHaveBeenCalled();
    });
  });

  describe("shift", () => {
    it("should shift a value", () => {
      const arr = reactiveArray([1, 2, 3]);
      const value = arr.shift();
      expect(value).toBe(1);
      expect(arr.length).toBe(2);
      expect(arr[0]).toBe(2);
      expect(arr[1]).toBe(3);
    });

    it("should return undefined if array is empty", () => {
      const arr = reactiveArray<number>();
      const value = arr.shift();
      expect(value).toBe(undefined);
      expect(arr.length).toBe(0);
    });

    it("should notify on shift", () => {
      const arr = reactiveArray([1, 2, 3]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.shift();

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(arr);

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on shift if array is empty", () => {
      const arr = reactiveArray<number>();

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.shift();

      expect(mockNotify).not.toHaveBeenCalled();
      expect(onDisposeValueSpy).not.toHaveBeenCalled();
    });
  });

  describe("unshift", () => {
    it("should unshift a value", () => {
      const arr = reactiveArray([2, 3]);
      const length = arr.unshift(1);
      expect(length).toBe(3);
      expect(arr[0]).toBe(1);
      expect(arr[1]).toBe(2);
      expect(arr[2]).toBe(3);
    });

    it("should unshift multiple values", () => {
      const arr = reactiveArray([3, 4]);
      const length = arr.unshift(1, 2);
      expect(length).toBe(4);
      expect(arr[0]).toBe(1);
      expect(arr[1]).toBe(2);
      expect(arr[2]).toBe(3);
      expect(arr[3]).toBe(4);
    });

    it("should notify on unshift", () => {
      const arr = reactiveArray([2, 3]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.unshift(1);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(arr);

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on unshift if no items", () => {
      const arr = reactiveArray([1, 2]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.unshift();

      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("splice", () => {
    it("should splice and remove elements", () => {
      const arr = [1, 2, 3, 4];
      const arr1$ = reactiveArray([...arr]);
      const arr2$ = reactiveArray(arr);

      const removed = arr.splice(1, 2);
      const removed1 = arr1$.splice(1, 2);
      const removed2 = arr2$.splice(1, 2);

      expect(removed1).toEqual(removed);
      expect(removed2).toEqual(removed);

      expect(arr1$).toEqual(arr);
      expect(arr2$).toEqual(arr);
    });

    it("should not remove elements if the second argument is not provided", () => {
      const arr = [1, 2, 3, 4];
      const arr1$ = reactiveArray([...arr]);
      const arr2$ = reactiveArray(arr);

      const removed = arr.splice(0);
      const removed1 = arr1$.splice(0);
      const removed2 = arr2$.splice(0);

      expect(removed1).toEqual(removed);
      expect(removed2).toEqual(removed);

      expect(arr1$).toEqual(arr);
      expect(arr2$).toEqual(arr);
    });

    it("should splice and add elements", () => {
      const arr = [1, 4];
      const arr1$ = reactiveArray([...arr]);
      const arr2$ = reactiveArray(arr);

      const removed = arr.splice(1, 0, 2, 3);
      const removed1 = arr1$.splice(1, 0, 2, 3);
      const removed2 = arr2$.splice(1, 0, 2, 3);

      expect(removed1).toEqual(removed);
      expect(removed2).toEqual(removed);

      expect(arr1$).toEqual(arr);
      expect(arr2$).toEqual(arr);
    });

    it("should splice and replace elements", () => {
      const arr = [1, 2, 3, 4];
      const arr1$ = reactiveArray([...arr]);
      const arr2$ = reactiveArray(arr);

      const removed = arr.splice(1, 2, 5, 6);
      const removed1 = arr1$.splice(1, 2, 5, 6);
      const removed2 = arr2$.splice(1, 2, 5, 6);

      expect(removed1).toEqual(removed);
      expect(removed2).toEqual(removed);

      expect(arr1$).toEqual(arr);
      expect(arr2$).toEqual(arr);
    });

    it("should notify on splice when removing", () => {
      const arr1$ = reactiveArray([1, 2, 3, 4]);

      const mockNotify = vi.fn();
      arr1$.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr1$.onDisposeValue(onDisposeValueSpy);

      arr1$.splice(1, 2);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(arr1$);

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    it("should notify on splice when adding", () => {
      const arr = reactiveArray([1, 4]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.splice(1, 0, 2, 3);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(arr);

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on splice if no changes", () => {
      const arr = reactiveArray([1, 2, 3]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.splice(1, 0);

      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("reverse", () => {
    it("should reverse array", () => {
      const arr = reactiveArray([1, 2, 3]);
      const result = arr.reverse();
      expect(result).toBe(arr);
      expect(arr).toEqual([3, 2, 1]);
    });

    it("should notify on reverse", () => {
      const arr = reactiveArray([1, 2, 3]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.reverse();

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(arr);

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on reverse if array has 0-1 elements", () => {
      const arr = reactiveArray([1]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.reverse();

      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("sort", () => {
    it("should sort array", () => {
      const arr = reactiveArray([3, 1, 2]);
      const result = arr.sort();
      expect(result).toBe(arr);
      expect(arr).toEqual([1, 2, 3]);
    });

    it("should sort array with custom compareFn", () => {
      const arr = reactiveArray([1, 2, 3]);
      arr.sort((a, b) => b - a);
      expect(arr).toEqual([3, 2, 1]);
    });

    it("should notify on sort", () => {
      const arr = reactiveArray([3, 1, 2]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.sort();

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(arr);

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on sort if array has 0-1 elements", () => {
      const arr = reactiveArray([1]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.sort();

      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("copyWithin", () => {
    it("should copy within array", () => {
      const arr = reactiveArray([1, 2, 3, 4, 5]);
      const result = arr.copyWithin(0, 3);
      expect(result).toBe(arr);
      expect(arr).toEqual([4, 5, 3, 4, 5]);
    });

    it("should copy within array with end", () => {
      const arr = reactiveArray([1, 2, 3, 4, 5]);
      arr.copyWithin(0, 3, 4);
      expect(arr).toEqual([4, 2, 3, 4, 5]);
    });

    it("should notify on copyWithin", () => {
      const arr = reactiveArray([1, 2, 3, 4, 5]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.copyWithin(0, 3);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(arr);

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on copyWithin if array is empty", () => {
      const arr = reactiveArray<number>();

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      arr.copyWithin(0, 1);

      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe("replace", () => {
    it("should replace the array with the specified elements", () => {
      const arr = reactiveArray([1, 2, 3]);
      const spy = vi.fn();
      arr.$.reaction(spy);

      expect(spy).toHaveBeenCalledTimes(0);

      arr.replace([4, 5, 6]);

      expect(spy).toHaveBeenCalledTimes(1);

      expect(arr).toEqual([4, 5, 6]);
    });

    it("should replace the array with less elements", () => {
      const arr = reactiveArray([1, 2, 3]);
      const spy = vi.fn();
      arr.$.reaction(spy);

      expect(spy).toHaveBeenCalledTimes(0);

      arr.replace([1]);

      expect(spy).toHaveBeenCalledTimes(1);

      expect(arr).toEqual([1]);
    });

    it("should replace the array with different order", () => {
      const arr = reactiveArray([1, 2, 3]);
      const spy = vi.fn();
      arr.$.reaction(spy);

      expect(spy).toHaveBeenCalledTimes(0);

      arr.replace([3, 2, 1]);

      expect(spy).toHaveBeenCalledTimes(1);

      expect(arr).toEqual([3, 2, 1]);
    });

    it("should replace an empty array with the specified elements", () => {
      const arr = reactiveArray<number>([]);

      const spy = vi.fn();
      arr.$.reaction(spy);

      expect(spy).toHaveBeenCalledTimes(0);

      arr.replace([1, 2, 3]);

      expect(spy).toHaveBeenCalledTimes(1);

      expect(arr).toEqual([1, 2, 3]);
    });

    it("should notify on replace", () => {
      const arr = reactiveArray(["a", "b", "c"]);
      const mockNotify = vi.fn();
      const dispose = arr.$.reaction(mockNotify);

      arr.replace(["x", "y", "z"]);
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).lastCalledWith(arr);

      dispose();
    });

    it("should not notify if not changed", () => {
      const arr = reactiveArray([1]);
      const mockNotify = vi.fn();
      const dispose = arr.$.reaction(mockNotify);

      arr.replace([2, 3]);
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).lastCalledWith(arr);

      dispose();
    });

    it("should notify if some keys are removed", () => {
      const arr = reactiveArray([1, 2, 3]);
      const mockNotify = vi.fn();
      const dispose = arr.$.reaction(mockNotify);

      expect(arr).toEqual([1, 2, 3]);

      arr.replace([1, 2]);
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(arr).toEqual([1, 2]);

      dispose();
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

    it("should dispose of resources", () => {
      const consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => void 0);

      const arr = reactiveArray([1, 2, 3]);

      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      const onDisposeValueSpy = vi.fn();
      arr.onDisposeValue(onDisposeValueSpy);

      expect(arr.length).toBe(3);
      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);

      expect(consoleErrorMock).not.toBeCalled();

      arr.dispose();

      expect(arr.length).toBe(3);
      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(3);
      expect(onDisposeValueSpy).toHaveBeenCalledWith(1);
      expect(onDisposeValueSpy).toHaveBeenCalledWith(2);
      expect(onDisposeValueSpy).toHaveBeenCalledWith(3);

      onDisposeValueSpy.mockClear();

      arr.push(4);
      expect(arr.length).toBe(4);
      expect(arr[3]).toBe(4);
      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);

      expect(consoleErrorMock).toBeCalled();

      consoleErrorMock.mockRestore();
    });

    it("should allow disposing multiple times", () => {
      const arr = reactiveArray([1, 2, 3]);
      expect(() => {
        arr.dispose();
        arr.dispose();
      }).not.toThrow();
    });
  });

  describe("onDisposeValue", () => {
    it("should notify multiple listeners when a value should be disposed", () => {
      const arr = reactiveArray([1, 2, 3]);
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      arr.onDisposeValue(listener1);
      const dispose = arr.onDisposeValue(listener2);

      arr.dispose();
      expect(listener1).toHaveBeenCalledTimes(3);
      expect(listener1).toHaveBeenCalledWith(1);
      expect(listener1).toHaveBeenCalledWith(2);
      expect(listener1).toHaveBeenCalledWith(3);
      expect(listener2).toHaveBeenCalledTimes(3);
      expect(listener2).toHaveBeenCalledWith(1);
      expect(listener2).toHaveBeenCalledWith(2);
      expect(listener2).toHaveBeenCalledWith(3);

      listener1.mockClear();
      listener2.mockClear();

      dispose();

      const arr2 = reactiveArray([4, 5]);
      arr2.onDisposeValue(listener1);
      arr2.onDisposeValue(listener2);
      arr2.dispose();

      expect(listener1).toHaveBeenCalledTimes(2);
      expect(listener2).toHaveBeenCalledTimes(2);
    });

    it("should not notify removed listeners", () => {
      const arr = reactiveArray([1, 2, 3]);
      const listener = vi.fn();
      const dispose = arr.onDisposeValue(listener);

      dispose();
      arr.dispose();
      expect(listener).toHaveBeenCalledTimes(0);
    });

    it("should do nothing on empty array", () => {
      const arr = reactiveArray();
      const listener = vi.fn();
      arr.onDisposeValue(listener);
      arr.dispose();
      expect(listener).toHaveBeenCalledTimes(0);
    });
  });

  describe("$ (reactive property)", () => {
    it("should emit array on changes", () => {
      const arr = reactiveArray<number>();
      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      arr.push(1);
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(arr);

      arr.push(2);
      expect(mockNotify).toHaveBeenCalledTimes(2);
      expect(mockNotify).toHaveBeenCalledWith(arr);
    });

    it("should not emit on non-mutating operations", () => {
      const arr = reactiveArray([1, 2, 3]);
      const mockNotify = vi.fn();
      arr.$.reaction(mockNotify);

      // Non-mutating operations
      arr.slice(0, 2);
      arr.map(x => x * 2);
      arr.filter(x => x > 1);
      arr.find(x => x === 2);
      arr.indexOf(2);

      expect(mockNotify).toHaveBeenCalledTimes(0);
    });
  });
});
