import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { batch, computed, derived, reactiveList, until, watch, writable } from "../src";

async function tick() {
  await Promise.resolve();
}

describe("until", () => {
  describe("predicate", () => {
    it("resolves immediately when the initial predicate is truthy without leaving subscriptions", async () => {
      const count$ = writable(5);
      const calls = vi.fn(() => (count$.get() >= 5 ? count$.get() : false));

      const result = await until(calls);
      expect(result).toBe(5);
      expectTypeOf(result).toEqualTypeOf<number>();
      expect(calls).toHaveBeenCalledTimes(1);

      count$.set(10);
      await tick();
      expect(calls).toHaveBeenCalledTimes(1);
    });

    it("waits until the predicate becomes truthy and tracks multiple sources and collections", async () => {
      const ready$ = writable(false);
      const items = reactiveList<string>();

      const promise = until(() => (ready$.get() && items.length > 0 ? items.get(0) : null));
      expectTypeOf(promise).toEqualTypeOf<Promise<string>>();

      let resolved: string | undefined;
      promise.then((value) => {
        resolved = value;
      });

      await tick();
      expect(resolved).toBeUndefined();

      ready$.set(true);
      await tick();
      expect(resolved).toBeUndefined();

      items.push("hello");
      await tick();
      expect(resolved).toBe("hello");
    });

    it("supports passing source.get directly and narrows falsy types", async () => {
      const name$ = writable<string | null>(null);
      const formatted$ = computed(() => (name$.get() ? `${name$.get()}!` : ""));

      const promise = until(formatted$.get);
      expectTypeOf(promise).toEqualTypeOf<Promise<string>>();

      let resolved: string | undefined;
      promise.then((value) => {
        resolved = value;
      });

      await tick();
      expect(resolved).toBeUndefined();

      name$.set("embra");
      await tick();
      expect(resolved).toBe("embra!");
    });

    it("supports derived sources and narrowed return values", async () => {
      type State = { status: "loading" } | { status: "ready"; data: number };
      const state$ = writable<State>({ status: "loading" });
      const readyState$ = derived(state$, (s) => (s.status === "ready" ? s : null));

      const promise = until(readyState$.get);
      expectTypeOf(promise).toEqualTypeOf<Promise<{ status: "ready"; data: number }>>();

      state$.set({ status: "ready", data: 42 });
      expect(await promise).toEqual({ status: "ready", data: 42 });
    });
  });

  describe("scheduling", () => {
    it("coalesces transient changes by default (sync: false)", async () => {
      const flag$ = writable(false);
      let settled = false;
      const promise = until(flag$.get).then(() => {
        settled = true;
      });

      flag$.set(true);
      flag$.set(false);
      await tick();
      expect(settled).toBe(false);

      flag$.set(true);
      await promise;
      expect(settled).toBe(true);
    });

    it("observes synchronous transient values when sync is true", async () => {
      const value$ = writable(0);
      const promise = until(value$.get, { sync: true });

      value$.set(1);
      value$.set(0);

      expect(await promise).toBe(1);
    });
  });

  describe("AbortSignal", () => {
    it("rejects immediately when given an already-aborted signal without calling predicate", async () => {
      const controller = new AbortController();
      const reason = new Error("already aborted");
      controller.abort(reason);

      const predicate = vi.fn(() => true);
      await expect(until(predicate, { signal: controller.signal })).rejects.toBe(reason);
      expect(predicate).not.toHaveBeenCalled();
    });

    it("rejects and cleans up subscriptions when aborted while waiting", async () => {
      const controller = new AbortController();
      const reason = new Error("cancelled");
      const count$ = writable(0);
      const reads = vi.fn(() => count$.get() > 10);

      const promise = until(reads, { signal: controller.signal });
      expect(reads).toHaveBeenCalledTimes(1);

      controller.abort(reason);
      await expect(promise).rejects.toBe(reason);

      count$.set(20);
      await tick();
      expect(reads).toHaveBeenCalledTimes(1);
    });

    it("ignores abort after the promise has already resolved", async () => {
      const controller = new AbortController();
      const count$ = writable(1);

      const result = await until(count$.get, { signal: controller.signal });
      expect(result).toBe(1);

      controller.abort(new Error("late abort"));
      await tick();
    });

    it("rejects if aborted synchronously during the initial or subsequent check", async () => {
      const controller1 = new AbortController();
      const reason1 = new Error("abort during initial");
      await expect(
        until(
          () => {
            controller1.abort(reason1);
            return false;
          },
          { signal: controller1.signal },
        ),
      ).rejects.toBe(reason1);

      const controller2 = new AbortController();
      const reason2 = new Error("abort during update");
      const trigger$ = writable(0);
      const promise = until(
        () => {
          if (trigger$.get() > 0) {
            controller2.abort(reason2);
            return true;
          }
          return false;
        },
        { signal: controller2.signal },
      );

      trigger$.set(1);
      await expect(promise).rejects.toBe(reason2);
    });
  });

  describe("error handling", () => {
    it("rejects when predicate throws initially or on update without breaking sibling watches", async () => {
      const initialErr = new Error("initial fail");
      await expect(
        until(() => {
          throw initialErr;
        }),
      ).rejects.toBe(initialErr);

      const trigger$ = writable(0);
      const updateErr = new Error("update fail");
      const siblingSpy = vi.fn();
      const stopSibling = watch(() => {
        siblingSpy(trigger$.get());
      });

      const promise = until(() => {
        if (trigger$.get() > 0) {
          throw updateErr;
        }
        return false;
      });

      batch(() => {
        trigger$.set(1);
      });

      await expect(promise).rejects.toBe(updateErr);
      expect(siblingSpy.mock.calls).toEqual([[0], [1]]);

      stopSibling();
    });
  });
});
