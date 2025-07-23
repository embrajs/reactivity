import { describe, it, expect, vi } from "vitest";

import { batch, reactiveMap } from "../../src";

describe("ReactiveMap", () => {
  describe("get", () => {
    it("should return the value if it exists", () => {
      const map = reactiveMap<string, number>();
      expect(map.get("foo")).toBeUndefined();
      map.set("foo", 1);
      expect(map.get("foo")).toEqual(1);
    });
  });

  describe("set", () => {
    it("should set a value", () => {
      const map = reactiveMap<string, number>();
      map.set("foo", 1);
      expect(map.get("foo")).toEqual(1);
    });

    it("should notify on set", () => {
      const map = reactiveMap<string, number>();

      const mockNotify = vi.fn();
      map.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      map.onChanged(onChangedSpy);

      const onValueRemovedSpy = vi.fn();
      map.onValueRemoved(onValueRemovedSpy);

      map.set("foo", 1);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(map);

      expect(onChangedSpy).toHaveBeenCalledTimes(1);
      expect(onChangedSpy).toHaveBeenCalledWith({ upsert: [["foo", 1]], delete: [] });

      expect(onValueRemovedSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on set if setting same value", () => {
      const map = reactiveMap<string, number>();

      const mockNotify = vi.fn();
      map.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      map.onChanged(onChangedSpy);

      const onValueRemovedSpy = vi.fn();
      map.onValueRemoved(onValueRemovedSpy);

      map.set("foo", 1);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(map);

      expect(onChangedSpy).toHaveBeenCalledTimes(1);
      expect(onChangedSpy).toHaveBeenCalledWith({ upsert: [["foo", 1]], delete: [] });

      expect(onValueRemovedSpy).toHaveBeenCalledTimes(0);

      mockNotify.mockClear();
      onChangedSpy.mockClear();

      map.set("foo", 1);

      expect(mockNotify).toHaveBeenCalledTimes(0);
      expect(onChangedSpy).toHaveBeenCalledTimes(0);

      expect(onValueRemovedSpy).toHaveBeenCalledTimes(0);
    });

    describe("batchSet", () => {
      it("should set multiple values", () => {
        const map = reactiveMap<string, number>();
        batch(() => {
          map.set("foo", 1);
          map.set("bar", 2);
        });
        expect(map.get("foo")).toEqual(1);
        expect(map.get("bar")).toEqual(2);
      });

      it("should notify on batchSet", () => {
        const map = reactiveMap<string, number>();

        const mockNotify = vi.fn();
        map.$.reaction(mockNotify);

        const onChangedSpy = vi.fn();
        map.onChanged(onChangedSpy);

        const onValueRemovedSpy = vi.fn();
        map.onValueRemoved(onValueRemovedSpy);

        batch(() => {
          map.set("foo", 1);
          map.set("bar", 2);
        });

        expect(mockNotify).toHaveBeenCalledTimes(1);
        expect(mockNotify).toHaveBeenCalledWith(map);

        expect(onChangedSpy).toHaveBeenCalledTimes(1);
        expect(onChangedSpy).toHaveBeenCalledWith({
          upsert: [
            ["foo", 1],
            ["bar", 2],
          ],
          delete: [],
        });

        expect(onValueRemovedSpy).toHaveBeenCalledTimes(0);
      });

      it("should not notify on batchSet if setting same values", () => {
        const map = reactiveMap<string, number>();

        const mockNotify = vi.fn();
        map.$.reaction(mockNotify);

        const onChangedSpy = vi.fn();
        map.onChanged(onChangedSpy);

        const onValueRemovedSpy = vi.fn();
        map.onValueRemoved(onValueRemovedSpy);

        batch(() => {
          map.set("foo", 1);
          map.set("bar", 2);
        });

        expect(mockNotify).toHaveBeenCalledTimes(1);
        expect(mockNotify).toHaveBeenCalledWith(map);

        expect(onChangedSpy).toHaveBeenCalledTimes(1);
        expect(onChangedSpy).toHaveBeenCalledWith({
          upsert: [
            ["foo", 1],
            ["bar", 2],
          ],
          delete: [],
        });

        mockNotify.mockClear();
        onChangedSpy.mockClear();

        batch(() => {
          map.set("foo", 1);
          map.set("bar", 2);
        });

        expect(mockNotify).toHaveBeenCalledTimes(0);
        expect(onChangedSpy).toHaveBeenCalledTimes(0);

        expect(onValueRemovedSpy).toHaveBeenCalledTimes(0);
      });
    });
  });

  describe("delete", () => {
    it("should delete a value", () => {
      const map = reactiveMap<string, number>();
      map.set("foo", 1);
      map.delete("foo");
      expect(map.get("foo")).toBeUndefined();
    });

    it("should notify on delete", () => {
      const map = reactiveMap<string, number>();
      map.set("foo", 1);

      const mockNotify = vi.fn();
      map.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      map.onChanged(onChangedSpy);

      const onValueRemovedSpy = vi.fn();
      map.onValueRemoved(onValueRemovedSpy);

      map.delete("foo");

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(map);

      expect(onChangedSpy).toHaveBeenCalledTimes(1);
      expect(onChangedSpy).toHaveBeenCalledWith({ upsert: [], delete: ["foo"] });

      expect(onValueRemovedSpy).toHaveBeenCalledTimes(1);
      expect(onValueRemovedSpy).toHaveBeenCalledWith(1);
    });

    it("should not notify on delete if the element does not exist.", () => {
      const map = reactiveMap<string, number>();

      const mockNotify = vi.fn();
      map.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      map.onChanged(onChangedSpy);

      const onValueRemovedSpy = vi.fn();
      map.onValueRemoved(onValueRemovedSpy);

      map.delete("foo");

      expect(mockNotify).not.toHaveBeenCalled();
      expect(onChangedSpy).not.toHaveBeenCalled();
      expect(onValueRemovedSpy).not.toHaveBeenCalled();
    });

    describe("batchDelete", () => {
      it("should delete multiple values", () => {
        const map = reactiveMap<string, number>();
        map.set("foo", 1);
        map.set("bar", 2);
        batch(() => {
          map.delete("foo");
          map.delete("bar");
        });
        expect(map.get("foo")).toBeUndefined();
        expect(map.get("bar")).toBeUndefined();
      });

      it("should notify on batchDelete", () => {
        const map = reactiveMap<string, number>();
        map.set("foo", 1);
        map.set("bar", 2);

        const mockNotify = vi.fn();
        map.$.reaction(mockNotify);

        const onChangedSpy = vi.fn();
        map.onChanged(onChangedSpy);

        const onValueRemovedSpy = vi.fn();
        map.onValueRemoved(onValueRemovedSpy);

        batch(() => {
          map.delete("foo");
          map.delete("bar");
        });

        expect(mockNotify).toHaveBeenCalledTimes(1);
        expect(mockNotify).toHaveBeenCalledWith(map);

        expect(onChangedSpy).toHaveBeenCalledTimes(1);
        expect(onChangedSpy).toHaveBeenCalledWith({
          upsert: [],
          delete: ["foo", "bar"],
        });

        expect(onValueRemovedSpy).toHaveBeenCalledTimes(2);
        expect(onValueRemovedSpy).toHaveBeenCalledWith(1);
        expect(onValueRemovedSpy).toHaveBeenCalledWith(2);
      });

      it("should not notify on batchDelete if the element does not exist.", () => {
        const map = reactiveMap<string, number>();

        const mockNotify = vi.fn();
        map.$.reaction(mockNotify);

        const onChangedSpy = vi.fn();
        map.onChanged(onChangedSpy);

        const onValueRemovedSpy = vi.fn();
        map.onValueRemoved(onValueRemovedSpy);

        batch(() => {
          map.delete("foo");
          map.delete("bar");
        });

        expect(mockNotify).not.toHaveBeenCalled();
        expect(onChangedSpy).not.toHaveBeenCalled();
        expect(onValueRemovedSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe("clear", () => {
    it("should clear all values", () => {
      const map = reactiveMap<string, number>();
      map.set("foo", 1);
      map.set("bar", 2);
      map.clear();
      expect(map.get("foo")).toBeUndefined();
      expect(map.get("bar")).toBeUndefined();
    });

    it("should notify on clear", () => {
      const map = reactiveMap<string, number>();
      map.set("foo", 1);

      const mockNotify = vi.fn();
      map.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      map.onChanged(onChangedSpy);

      const onValueRemovedSpy = vi.fn();
      map.onValueRemoved(onValueRemovedSpy);

      map.clear();

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(map);

      expect(onChangedSpy).toHaveBeenCalledTimes(1);
      expect(onChangedSpy).toHaveBeenCalledWith({ upsert: [], delete: ["foo"] });

      expect(onValueRemovedSpy).toHaveBeenCalledTimes(1);
      expect(onValueRemovedSpy).toHaveBeenCalledWith(1);
    });

    it("should not notify on delete if the map is empty.", () => {
      const map = reactiveMap<string, number>();

      const mockNotify = vi.fn();
      map.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      map.onChanged(onChangedSpy);

      const onValueRemovedSpy = vi.fn();
      map.onValueRemoved(onValueRemovedSpy);

      map.clear();

      expect(mockNotify).not.toHaveBeenCalled();
      expect(onChangedSpy).not.toHaveBeenCalled();
      expect(onValueRemovedSpy).not.toHaveBeenCalled();
    });
  });

  describe("rename", () => {
    it("should rename a key", () => {
      const map = reactiveMap<string, number>();
      map.set("foo", 1);

      map.rename("foo", "bar");

      expect(map.get("foo")).toBeUndefined();
      expect(map.get("bar")).toBe(1);
    });

    it("should notify only once on rename", () => {
      const map = reactiveMap<string, number>();
      map.set("foo", 1);

      const mockNotify = vi.fn();
      map.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      map.onChanged(onChangedSpy);

      const onValueRemovedSpy = vi.fn();
      map.onValueRemoved(onValueRemovedSpy);

      map.rename("foo", "bar");

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith(map);

      expect(onChangedSpy).toHaveBeenCalledTimes(1);
      expect(onChangedSpy).toHaveBeenCalledWith({
        upsert: [["bar", 1]],
        delete: ["foo"],
      });

      expect(onValueRemovedSpy).toHaveBeenCalledTimes(0);
    });

    it("should not notify on rename if the element does not exist.", () => {
      const map = reactiveMap<string, number>();

      const mockNotify = vi.fn();
      map.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      map.onChanged(onChangedSpy);

      const onValueRemovedSpy = vi.fn();
      map.onValueRemoved(onValueRemovedSpy);

      map.rename("foo", "bar");

      expect(mockNotify).not.toHaveBeenCalled();
      expect(onChangedSpy).not.toHaveBeenCalled();

      expect(onValueRemovedSpy).toHaveBeenCalledTimes(0);
    });

    it("should overwrite the value if the new key already exists", () => {
      const map = reactiveMap<string, number>();
      map.set("foo", 1);
      map.set("bar", 2);

      const mockNotify = vi.fn();
      map.$.reaction(mockNotify);

      const onChangedSpy = vi.fn();
      map.onChanged(onChangedSpy);

      const onValueRemovedSpy = vi.fn();
      map.onValueRemoved(onValueRemovedSpy);

      map.rename("foo", "bar");

      expect(map.get("foo")).toBeUndefined();
      expect(map.get("bar")).toBe(1);

      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).lastCalledWith(map);

      expect(onChangedSpy).toHaveBeenCalledTimes(1);
      expect(onChangedSpy).toHaveBeenCalledWith({
        upsert: [["bar", 1]],
        delete: ["foo"],
      });

      expect(onValueRemovedSpy).toHaveBeenCalledTimes(1);
      expect(onValueRemovedSpy).toHaveBeenCalledWith(2);
    });
  });
});
