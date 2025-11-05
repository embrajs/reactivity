import { describe, it, expect, vi, afterAll, beforeAll } from "vitest";

import { batch, reactiveSet } from "../../src";

describe("ReactiveSet", () => {
  describe("constructor", () => {
    it("should create an empty set", () => {
      const set = reactiveSet<number>();
      expect(set.size).toBe(0);
    });

    it("should create a set with initial values", () => {
      const values = [1, 2, 3];
      const set = reactiveSet(values);
      expect(set.size).toBe(3);
      expect(set.has(1)).toBe(true);
      expect(set.has(2)).toBe(true);
      expect(set.has(3)).toBe(true);
      expect(set.has(4)).toBe(false);
    });
  });

  describe("has", () => {
    it("should return true if value exists", () => {
      const set = reactiveSet<number>();
      expect(set.has(1)).toBe(false);
      set.add(1);
      expect(set.has(1)).toBe(true);
    });
  });

  describe("add", () => {
    it("should add a value", () => {
      const set = reactiveSet<number>();
      set.add(1);
      expect(set.size).toBe(1);
      expect(set.has(1)).toBe(true);
    });

    it("should not add duplicate value", () => {
      const set = reactiveSet<number>();
      set.add(1);
      expect(set.size).toBe(1);
      set.add(1);
      expect(set.size).toBe(1);
    });

    it("should notify on add", () => {
      const set = reactiveSet<number>();

      const mockNotify = vi.fn();
      set.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      set.onChanged(onChangedSpy);

      const onDisposeValueSpy = vi.fn();
      set.onDisposeValue(onDisposeValueSpy);

      set.add(1);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(set);

      expect(onChangedSpy).toHaveBeenCalledTimes(1);
      expect(onChangedSpy).toHaveBeenCalledWith({ upsert: [1], delete: [] });

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on add if adding same value", () => {
      const set = reactiveSet<number>();

      const mockNotify = vi.fn();
      set.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      set.onChanged(onChangedSpy);

      const onDisposeValueSpy = vi.fn();
      set.onDisposeValue(onDisposeValueSpy);

      set.add(1);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(set);

      expect(onChangedSpy).toHaveBeenCalledTimes(1);
      expect(onChangedSpy).toHaveBeenCalledWith({ upsert: [1], delete: [] });

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);

      mockNotify.mockClear();
      onChangedSpy.mockClear();

      set.add(1);

      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onChangedSpy).toHaveBeenCalledTimes(0);

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
    });

    describe("batchAdd", () => {
      it("should add multiple values", () => {
        const set = reactiveSet<number>();
        batch(() => {
          set.add(1);
          set.add(2);
        });
        expect(set.has(1)).toBe(true);
        expect(set.has(2)).toBe(true);
        expect(set.size).toBe(2);
      });

      it("should notify on batchAdd", () => {
        const set = reactiveSet<number>();

        const mockNotify = vi.fn();
        set.$.reaction(mockNotify);

        const onChangedSpy = vi.fn();
        set.onChanged(onChangedSpy);

        const onDisposeValueSpy = vi.fn();
        set.onDisposeValue(onDisposeValueSpy);

        batch(() => {
          set.add(1);
          set.add(2);
        });

        expect(mockNotify).toHaveBeenCalledTimes(1);
        expect(mockNotify).toHaveBeenCalledWith(set);

        expect(onChangedSpy).toHaveBeenCalledTimes(1);
        expect(onChangedSpy).toHaveBeenCalledWith({
          upsert: [1, 2],
          delete: [],
        });

        expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
      });

      it("should not notify on batchAdd if adding same values", () => {
        const set = reactiveSet<number>();

        const mockNotify = vi.fn();
        set.$.reaction(mockNotify);

        const onChangedSpy = vi.fn();
        set.onChanged(onChangedSpy);

        const onDisposeValueSpy = vi.fn();
        set.onDisposeValue(onDisposeValueSpy);

        batch(() => {
          set.add(1);
          set.add(2);
        });

        expect(mockNotify).toHaveBeenCalledTimes(1);
        expect(mockNotify).toHaveBeenCalledWith(set);

        expect(onChangedSpy).toHaveBeenCalledTimes(1);
        expect(onChangedSpy).toHaveBeenCalledWith({
          upsert: [1, 2],
          delete: [],
        });

        mockNotify.mockClear();
        onChangedSpy.mockClear();

        batch(() => {
          set.add(1);
          set.add(2);
        });

        expect(mockNotify).toHaveBeenCalledTimes(0);
        expect(onChangedSpy).toHaveBeenCalledTimes(0);

        expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);
      });
    });
  });

  describe("delete", () => {
    it("should delete a value", () => {
      const set = reactiveSet<number>();
      set.add(1);
      expect(set.has(1)).toBe(true);
      set.delete(1);
      expect(set.has(1)).toBe(false);
    });

    it("should notify on delete", () => {
      const set = reactiveSet<number>();
      set.add(1);

      const mockNotify = vi.fn();
      set.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      set.onChanged(onChangedSpy);

      const onDisposeValueSpy = vi.fn();
      set.onDisposeValue(onDisposeValueSpy);

      set.delete(1);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(set);

      expect(onChangedSpy).toHaveBeenCalledTimes(1);
      expect(onChangedSpy).toHaveBeenCalledWith({ upsert: [], delete: [1] });

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(1);
      expect(onDisposeValueSpy).toHaveBeenCalledWith(1);
    });

    it("should not notify on delete if the element does not exist", () => {
      const set = reactiveSet<number>();

      const mockNotify = vi.fn();
      set.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      set.onChanged(onChangedSpy);

      const onDisposeValueSpy = vi.fn();
      set.onDisposeValue(onDisposeValueSpy);

      set.delete(1);

      expect(mockNotify).not.toHaveBeenCalled();
      expect(onChangedSpy).not.toHaveBeenCalled();
      expect(onDisposeValueSpy).not.toHaveBeenCalled();
    });

    describe("batchDelete", () => {
      it("should delete multiple values", () => {
        const set = reactiveSet<number>();
        set.add(1);
        set.add(2);
        batch(() => {
          set.delete(1);
          set.delete(2);
        });
        expect(set.has(1)).toBe(false);
        expect(set.has(2)).toBe(false);
        expect(set.size).toBe(0);
      });

      it("should notify on batchDelete", () => {
        const set = reactiveSet<number>();
        set.add(1);
        set.add(2);

        const mockNotify = vi.fn();
        set.$.reaction(mockNotify);

        const onChangedSpy = vi.fn();
        set.onChanged(onChangedSpy);

        const onDisposeValueSpy = vi.fn();
        set.onDisposeValue(onDisposeValueSpy);

        batch(() => {
          set.delete(1);
          set.delete(2);
        });

        expect(mockNotify).toHaveBeenCalledTimes(1);
        expect(mockNotify).toHaveBeenCalledWith(set);

        expect(onChangedSpy).toHaveBeenCalledTimes(1);
        expect(onChangedSpy).toHaveBeenCalledWith({
          upsert: [],
          delete: [1, 2],
        });

        expect(onDisposeValueSpy).toHaveBeenCalledTimes(2);
        expect(onDisposeValueSpy).toHaveBeenCalledWith(1);
        expect(onDisposeValueSpy).toHaveBeenCalledWith(2);
      });

      it("should not notify on batchDelete if the elements do not exist", () => {
        const set = reactiveSet<number>();

        const mockNotify = vi.fn();
        set.$.reaction(mockNotify);

        const onChangedSpy = vi.fn();
        set.onChanged(onChangedSpy);

        const onDisposeValueSpy = vi.fn();
        set.onDisposeValue(onDisposeValueSpy);

        batch(() => {
          set.delete(1);
          set.delete(2);
        });

        expect(mockNotify).not.toHaveBeenCalled();
        expect(onChangedSpy).not.toHaveBeenCalled();
        expect(onDisposeValueSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe("clear", () => {
    it("should clear all values", () => {
      const set = reactiveSet<number>();
      set.add(1);
      set.add(2);
      expect(set.size).toBe(2);
      set.clear();
      expect(set.size).toBe(0);
      expect(set.has(1)).toBe(false);
      expect(set.has(2)).toBe(false);
    });

    it("should notify on clear", () => {
      const set = reactiveSet<number>();
      set.add(1);
      set.add(2);

      const mockNotify = vi.fn();
      set.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      set.onChanged(onChangedSpy);

      const onDisposeValueSpy = vi.fn();
      set.onDisposeValue(onDisposeValueSpy);

      set.clear();

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(set);

      expect(onChangedSpy).toHaveBeenCalledTimes(1);
      expect(onChangedSpy).toHaveBeenCalledWith({ upsert: [], delete: [1, 2] });

      expect(onDisposeValueSpy).toHaveBeenCalledTimes(2);
      expect(onDisposeValueSpy).toHaveBeenCalledWith(1);
      expect(onDisposeValueSpy).toHaveBeenCalledWith(2);
    });

    it("should not notify on clear if the set is empty", () => {
      const set = reactiveSet<number>();

      const mockNotify = vi.fn();
      set.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      set.onChanged(onChangedSpy);

      const onDisposeValueSpy = vi.fn();
      set.onDisposeValue(onDisposeValueSpy);

      set.clear();

      expect(mockNotify).not.toHaveBeenCalled();
      expect(onChangedSpy).not.toHaveBeenCalled();
      expect(onDisposeValueSpy).not.toHaveBeenCalled();
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

    it("should clear the set and dispose of resources", () => {
      const consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => void 0);

      const set = reactiveSet<number>();
      set.add(1);
      set.add(2);

      const mockNotify = vi.fn();
      set.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      set.onChanged(onChangedSpy);

      const onDisposeValueSpy = vi.fn();
      set.onDisposeValue(onDisposeValueSpy);

      expect(set.size).toBe(2);
      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onChangedSpy).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);

      expect(consoleErrorMock).not.toBeCalled();

      set.dispose();

      expect(set.size).toBe(2);
      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onChangedSpy).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(2);
      expect(onDisposeValueSpy).toHaveBeenCalledWith(1);
      expect(onDisposeValueSpy).toHaveBeenCalledWith(2);

      onDisposeValueSpy.mockClear();

      set.add(3);
      expect(set.size).toBe(3);
      expect(set.has(3)).toBe(true);
      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onChangedSpy).toHaveBeenCalledTimes(0);
      expect(onDisposeValueSpy).toHaveBeenCalledTimes(0);

      expect(consoleErrorMock).toBeCalled();

      consoleErrorMock.mockRestore();
    });

    it("should allow disposing multiple times", () => {
      const set = reactiveSet<number>();
      expect(() => {
        set.dispose();
        set.dispose();
      }).not.toThrow();
    });
  });

  describe("onChanged", () => {
    it("should notify multiple listeners on change", () => {
      const set = reactiveSet<number>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      set.onChanged(listener1);
      const dispose = set.onChanged(listener2);

      set.add(1);
      expect(listener1).toHaveBeenCalledWith({ upsert: [1], delete: [] });
      expect(listener2).toHaveBeenCalledWith({ upsert: [1], delete: [] });

      listener1.mockClear();
      listener2.mockClear();

      dispose();

      set.add(2);
      expect(listener1).toHaveBeenCalledWith({ upsert: [2], delete: [] });
      expect(listener2).toHaveBeenCalledTimes(0);
    });

    it("should not notify listeners after dispose", () => {
      const consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => void 0);

      expect(consoleErrorMock).not.toBeCalled();

      const set = reactiveSet<number>();
      const listener = vi.fn();

      set.onChanged(listener);
      set.dispose();

      set.add(1);
      expect(listener).toHaveBeenCalledTimes(0);
      expect(consoleErrorMock).toBeCalled();

      consoleErrorMock.mockRestore();
    });

    it("should not notify disposed listeners", () => {
      const set = reactiveSet<number>();
      const listener = vi.fn();

      const dispose = set.onChanged(listener);
      dispose();

      set.add(1);
      expect(listener).toHaveBeenCalledTimes(0);
    });

    it("should not notify removed listeners", () => {
      const set = reactiveSet<number>();
      const listener1 = vi.fn();
      const dispose = set.onChanged(listener1);

      set.add(1);
      expect(listener1).toHaveBeenCalledTimes(1);

      listener1.mockClear();

      dispose();
      set.add(2);
      expect(listener1).toHaveBeenCalledTimes(0);

      const listener2 = vi.fn();
      set.onChanged(listener2);

      set.add(3);
      expect(listener2).toHaveBeenCalledWith({ upsert: [3], delete: [] });
      expect(listener1).toHaveBeenCalledTimes(0);
    });
  });

  describe("onDisposeValue", () => {
    it("should notify listeners when a value should be disposed", () => {
      const set = reactiveSet<number>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      set.onDisposeValue(listener1);
      const dispose = set.onDisposeValue(listener2);

      set.add(1);
      set.delete(1);
      expect(listener1).toHaveBeenCalledWith(1);
      expect(listener2).toHaveBeenCalledWith(1);

      listener1.mockClear();
      listener2.mockClear();

      dispose();

      set.add(2);
      set.delete(2);
      expect(listener1).toHaveBeenCalledWith(2);
      expect(listener2).toHaveBeenCalledTimes(0);
    });

    it("should not notify removed listeners", () => {
      const set = reactiveSet<number>();
      const listener = vi.fn();
      const dispose = set.onDisposeValue(listener);

      set.add(1);
      set.delete(1);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(1);

      listener.mockClear();

      dispose();
      set.add(2);
      set.delete(2);
      expect(listener).toHaveBeenCalledTimes(0);
    });

    it("should do nothing on empty set", () => {
      const set = reactiveSet();
      const listener = vi.fn();
      set.onDisposeValue(listener);
      set.dispose();
      expect(listener).toHaveBeenCalledTimes(0);
    });
  });
});
