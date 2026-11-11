import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { type EffectContext, type EffectFn, type WatchEffect, watch, writable } from "../src";

async function tick() {
  await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("watch", () => {
  describe("scheduling", () => {
    it.each([undefined, false])("runs immediately and coalesces later writes with sync: %s", async (sync) => {
      const first = writable(0);
      const second = writable(0);
      const spy = vi.fn();
      const stop = watch(
        () => {
          spy(first.get(), second.get());
        },
        sync === undefined ? undefined : { sync },
      );

      expect(spy.mock.calls).toEqual([[0, 0]]);
      first.set(1);
      second.set(1);
      first.set(2);
      expect(spy.mock.calls).toEqual([[0, 0]]);
      await tick();
      expect(spy.mock.calls).toEqual([
        [0, 0],
        [2, 1],
      ]);
      stop();
    });

    it("skips reverted asynchronous changes without running cleanup", async () => {
      const source = writable(0);
      const spy = vi.fn();
      const cleanup = vi.fn();
      const stop = watch(() => {
        spy(source.get());
        return cleanup;
      });

      source.set(1);
      source.set(0);
      await tick();
      expect(spy.mock.calls).toEqual([[0]]);
      expect(cleanup).not.toHaveBeenCalled();
      source.set(2);
      await tick();
      expect(spy.mock.calls).toEqual([[0], [2]]);
      expect(cleanup).toHaveBeenCalledOnce();
      stop();
    });

    it("still reruns when another dependency changes after one dependency reverts", async () => {
      const first = writable(0);
      const second = writable(0);
      const spy = vi.fn();
      const stop = watch(() => {
        spy(first.get(), second.get());
      });

      first.set(1);
      first.set(0);
      second.set(1);
      await tick();
      expect(spy.mock.calls).toEqual([
        [0, 0],
        [0, 1],
      ]);
      stop();
    });

    it("coalesces repeated values when equality is disabled", async () => {
      const source = writable(0, { equal: false });
      const spy = vi.fn();
      const stop = watch(() => {
        spy(source.get());
      });

      source.set(0);
      source.set(0);
      await tick();
      expect(spy.mock.calls).toEqual([[0], [0]]);
      stop();
    });

    it("delivers writes made by a watch together to synchronous observers", () => {
      const first = writable(0);
      const second = writable(0);
      const spy = vi.fn();
      const stopObserver = watch(
        () => {
          spy(first.get(), second.get());
        },
        { sync: true },
      );
      const stopWriter = watch(
        () => {
          first.set(1);
          second.set(2);
        },
        { sync: true },
      );

      expect(spy.mock.calls).toEqual([
        [0, 0],
        [1, 2],
      ]);
      stopWriter();
      stopObserver();
    });

    it("reruns when an already read dependency changes during the callback", () => {
      const source = writable(0);
      const spy = vi.fn();
      const stop = watch(
        () => {
          const value = source.get();
          spy(value);
          if (value < 2) source.set(value + 1);
        },
        { sync: true },
      );

      expect(spy.mock.calls).toEqual([[0], [1], [2]]);
      stop();
    });

    it("processes effect writes when the dependency is read again", () => {
      const source = writable(0);
      const spy = vi.fn();
      const stop = watch(
        () => {
          const value = source.get();
          if (value < 2) source.set(value + 1);
          spy(value, source.get());
        },
        { sync: true },
      );

      expect(spy.mock.calls).toEqual([
        [0, 1],
        [1, 2],
        [2, 2],
      ]);
      stop();
    });

    it("processes effect writes across nonconsecutive dependency reads", () => {
      const source = writable(0);
      const other = writable(0);
      const spy = vi.fn();
      const stop = watch(
        () => {
          const value = source.get();
          other.get();
          if (value === 0) {
            source.set(1);
            source.set(2);
          }
          spy(value, source.get());
        },
        { sync: true },
      );

      expect(spy.mock.calls).toEqual([
        [0, 2],
        [2, 2],
      ]);
      stop();
    });

    it("processes effect writes when another observer is subscribed during the callback", () => {
      const source = writable(0);
      const other = writable(0);
      const spy = vi.fn();
      const stop = watch(
        () => {
          const value = source.get();
          other.get();
          const unsubscribe = source.subscribe(() => {}, { sync: true, immediate: false });
          if (value === 0) source.set(1);
          spy(value, source.get());
          return unsubscribe;
        },
        { sync: true },
      );

      expect(spy.mock.calls).toEqual([
        [0, 1],
        [1, 1],
      ]);
      stop();
    });

    it("skips reverted writes even when the dependency is reread during the callback", () => {
      const source = writable(0);
      const spy = vi.fn();
      let write = true;
      const stop = watch(
        () => {
          const value = source.get();
          if (write) {
            write = false;
            source.set(1);
            source.set(0);
          }
          spy(value, source.get());
        },
        { sync: true },
      );

      expect(spy.mock.calls).toEqual([[0, 0]]);
      source.set(2);
      expect(spy.mock.calls).toEqual([
        [0, 0],
        [2, 2],
      ]);
      stop();
    });

    it("cancels queued work and cleans up the last completed run once", async () => {
      const source = writable(0);
      const spy = vi.fn();
      const cleanup = vi.fn();
      const stop = watch(() => {
        spy(source.get());
        return cleanup;
      });

      source.set(1);
      stop();
      stop();
      source.set(2);
      await tick();
      expect(spy.mock.calls).toEqual([[0]]);
      expect(cleanup).toHaveBeenCalledOnce();
    });
  });

  describe("dependencies", () => {
    it("runs immediately and observes each value it reads", () => {
      const first = writable(1);
      const second = writable(2);
      const spy = vi.fn();
      const stop = watch(
        () => {
          spy(first.get(), second.get());
        },
        { sync: true },
      );

      expect(spy.mock.calls).toEqual([[1, 2]]);
      first.set(3);
      second.set(4);
      expect(spy.mock.calls).toEqual([
        [1, 2],
        [3, 2],
        [3, 4],
      ]);

      stop();
      first.set(5);
      second.set(6);
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it("tracks property reads", () => {
      const source = writable(0);
      const spy = vi.fn();
      const stop = watch(
        () => {
          spy(source.value);
        },
        { sync: true },
      );

      source.value = 1;
      expect(spy.mock.calls).toEqual([[0], [1]]);
      stop();
    });

    it("switches conditional dependencies in both directions", () => {
      const condition = writable(true);
      const first = writable("a");
      const second = writable("b");
      const spy = vi.fn();
      const stop = watch(
        () => {
          spy(condition.get() ? first.get() : second.get());
        },
        { sync: true },
      );

      second.set("bb");
      expect(spy.mock.calls).toEqual([["a"]]);
      condition.set(false);
      expect(spy.mock.calls).toEqual([["a"], ["bb"]]);
      first.set("aa");
      expect(spy).toHaveBeenCalledTimes(2);
      second.set("bbb");
      condition.set(true);
      second.set("bbbb");
      expect(spy.mock.calls).toEqual([["a"], ["bb"], ["bbb"], ["aa"]]);
      stop();
    });

    it("preserves subscriptions when dependencies are read in a different order", () => {
      const reverse = writable(false);
      const first = writable(1);
      const second = writable(2);
      const third = writable(3);
      const spy = vi.fn();
      const stop = watch(
        () => {
          const sources = reverse.get() ? [third, first, second] : [first, second, third];
          spy(...sources.map((source) => source.get()));
        },
        { sync: true },
      );

      reverse.set(true);
      first.set(11);
      second.set(22);
      third.set(33);
      reverse.set(false);
      expect(spy.mock.calls).toEqual([
        [1, 2, 3],
        [3, 1, 2],
        [3, 11, 2],
        [3, 11, 22],
        [33, 11, 22],
        [11, 22, 33],
      ]);
      stop();
    });

    it("adds dependencies after reordering the existing ones", () => {
      const expanded = writable(false);
      const first = writable(1);
      const second = writable(2);
      const added = writable(3);
      const spy = vi.fn();
      const stop = watch(
        () => {
          if (expanded.get()) spy(second.get(), first.get(), added.get());
          else spy(first.get(), second.get());
        },
        { sync: true },
      );

      expanded.set(true);
      added.set(4);
      first.set(5);
      second.set(6);
      expect(spy.mock.calls).toEqual([
        [1, 2],
        [2, 1, 3],
        [2, 1, 4],
        [2, 5, 4],
        [6, 5, 4],
      ]);
      stop();
    });

    it("handles repeated reads without disturbing another observer", () => {
      const first = writable(1);
      const second = writable(2);
      const spy = vi.fn();
      const neighbor = vi.fn();
      const stop = watch(
        () => {
          spy(first.get(), second.get(), first.get(), second.get());
        },
        { sync: true },
      );
      const stopNeighbor = watch(
        () => {
          neighbor(first.get());
        },
        { sync: true },
      );

      first.set(3);
      second.set(4);
      expect(spy.mock.calls).toEqual([
        [1, 2, 1, 2],
        [3, 2, 3, 2],
        [3, 4, 3, 4],
      ]);
      stop();
      first.set(5);
      expect(spy).toHaveBeenCalledTimes(3);
      expect(neighbor.mock.calls).toEqual([[1], [3], [5]]);
      stopNeighbor();
    });

    it.each([7, 8, 9])("retains and releases shared dependencies at index %s", (index) => {
      const sources = Array.from({ length: 10 }, (_, i) => writable(i));
      const target = sources[index];
      const other = writable(0);
      const spy = vi.fn();
      let enabled = true;
      const stop = watch(
        () => {
          if (!enabled) {
            spy();
            return;
          }
          for (const source of sources) source.get();
          other.get();
          const value = target.get();
          const unsubscribe = target.subscribe(() => {}, { sync: true, immediate: false });
          if (value === index) target.set(index + 10);
          spy(target.get());
          return unsubscribe;
        },
        { sync: true },
      );

      expect(spy.mock.calls).toEqual([[index + 10], [index + 10]]);
      enabled = false;
      target.set(index + 20);
      expect(spy.mock.calls).toEqual([[index + 10], [index + 10], []]);
      for (const source of sources) source.set(-1);
      other.set(1);
      expect(spy).toHaveBeenCalledTimes(3);
      stop();
    });

    it("drops all subscriptions when a later run reads no reactive values", () => {
      const source = writable(0);
      let enabled = true;
      const spy = vi.fn();
      const stop = watch(
        () => {
          if (enabled) source.get();
          spy();
        },
        { sync: true },
      );

      enabled = false;
      source.set(1);
      source.set(2);
      expect(spy).toHaveBeenCalledTimes(2);
      stop();
    });

    it("keeps nested watches independent and restores the parent context", () => {
      const before = writable(0);
      const child = writable(0);
      const after = writable(0);
      const parentSpy = vi.fn();
      const childSpy = vi.fn();
      const stopParent = watch(
        () => {
          before.get();
          const stopChild = watch(
            () => {
              childSpy(child.get());
            },
            { sync: true },
          );
          after.get();
          parentSpy();
          return stopChild;
        },
        { sync: true },
      );

      child.set(1);
      expect(parentSpy).toHaveBeenCalledOnce();
      expect(childSpy.mock.calls).toEqual([[0], [1]]);
      after.set(1);
      before.set(1);
      expect(parentSpy).toHaveBeenCalledTimes(3);
      child.set(2);
      expect(parentSpy).toHaveBeenCalledTimes(3);
      expect(childSpy.mock.calls).toEqual([[0], [1], [1], [1], [2]]);
      stopParent();
      child.set(3);
      expect(childSpy).toHaveBeenCalledTimes(5);
    });
  });

  describe("subscription callbacks", () => {
    it("keeps nested effect contexts independent and restores outer tracking", () => {
      const source = writable(0);
      const tracked = writable(0);
      const contexts: EffectContext[] = [];
      const parent = vi.fn();
      const child = vi.fn();
      const stop = watch(
        function () {
          contexts.push(this);
          source.subscribe(
            function (value) {
              expect(this).not.toBe(contexts.at(-1));
              child(value);
              this.dispose();
            },
            { sync: true },
          );
          parent(tracked.get());
        },
        { sync: true },
      );

      source.set(1);
      expect(parent.mock.calls).toEqual([[0]]);
      expect(child.mock.calls).toEqual([[0]]);
      tracked.set(1);
      expect(parent.mock.calls).toEqual([[0], [1]]);
      expect(child.mock.calls).toEqual([[0], [1]]);
      expect(contexts[1]).toBe(contexts[0]);
      contexts[0].dispose();
      tracked.set(2);
      expect(parent).toHaveBeenCalledTimes(2);
      stop();
    });

    it("isolates initial subscription reads and restores tracking afterward", () => {
      const source = writable(0);
      const hidden = writable(0);
      const tracked = writable(0);
      const spy = vi.fn();
      const stop = watch(
        () => {
          const unsubscribe = source.subscribe(() => {
            hidden.get();
          });
          spy(tracked.get());
          return unsubscribe;
        },
        { sync: true },
      );

      hidden.set(1);
      source.set(1);
      expect(spy.mock.calls).toEqual([[0]]);
      tracked.set(1);
      expect(spy.mock.calls).toEqual([[0], [1]]);
      stop();
    });

    it("restores tracking after an initial subscription callback throws", () => {
      const source = writable(0);
      const hidden = writable(0);
      const tracked = writable(0);
      const error = new Error("subscription");
      const callback = vi.fn(() => {
        hidden.get();
        throw error;
      });
      const spy = vi.fn();
      const stop = watch(
        () => {
          expect(() => source.subscribe(callback)).toThrow(error);
          spy(tracked.get());
        },
        { sync: true },
      );

      hidden.set(1);
      source.set(1);
      expect(callback).toHaveBeenCalledOnce();
      expect(spy.mock.calls).toEqual([[0]]);
      tracked.set(1);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls).toEqual([[0], [1]]);
      stop();
    });
  });

  describe("cleanup", () => {
    it("runs cleanup once when the first callback disposes itself", () => {
      const source = writable(0);
      const other = writable(0);
      const spy = vi.fn();
      const cleanup = vi.fn();
      const effect: WatchEffect = function () {
        expectTypeOf(this).toEqualTypeOf<EffectContext>();
        spy(source.get());
        this.dispose();
        other.get();
        return cleanup;
      };
      expectTypeOf<EffectFn>().toEqualTypeOf<WatchEffect>();
      const stop = watch(effect, { sync: true });

      expect(cleanup).toHaveBeenCalledOnce();
      source.set(1);
      other.set(1);
      stop();
      stop();
      expect(spy.mock.calls).toEqual([[0]]);
      expect(cleanup).toHaveBeenCalledOnce();
    });

    it("cleans up the previous run before rerunning and the latest run when stopped", () => {
      const source = writable(0);
      const calls: string[] = [];
      const stop = watch(
        () => {
          const value = source.get();
          calls.push(`run:${value}`);
          return () => {
            calls.push(`cleanup:${value}`);
          };
        },
        { sync: true },
      );

      expect(calls).toEqual(["run:0"]);
      source.set(1);
      source.set(2);
      stop();
      stop();
      expect(calls).toEqual(["run:0", "cleanup:0", "run:1", "cleanup:1", "run:2", "cleanup:2"]);
    });

    it("does not track reactive reads inside cleanup", () => {
      const source = writable(0);
      const hidden = writable(0);
      const spy = vi.fn();
      const stop = watch(
        () => {
          spy(source.get());
          return () => {
            hidden.get();
          };
        },
        { sync: true },
      );

      source.set(1);
      hidden.set(1);
      expect(spy.mock.calls).toEqual([[0], [1]]);
      stop();
    });

    it("does not add a disposed child's cleanup reads to the parent dependencies", () => {
      const hidden = writable(0);
      const tracked = writable(0);
      const stopChild = watch(
        () => () => {
          hidden.get();
        },
        { sync: true },
      );
      const spy = vi.fn();
      const stopParent = watch(
        () => {
          stopChild();
          spy(tracked.get());
        },
        { sync: true },
      );

      hidden.set(1);
      expect(spy.mock.calls).toEqual([[0]]);
      tracked.set(1);
      expect(spy.mock.calls).toEqual([[0], [1]]);
      stopParent();
    });

    it("runs cleanup returned after a watch cancels itself", () => {
      const source = writable(0);
      const other = writable(0);
      const spy = vi.fn();
      const cleanup = vi.fn();
      const stop = watch(
        function () {
          expectTypeOf(this).toEqualTypeOf<EffectContext>();
          const value = source.get();
          spy(value);
          if (value === 1) {
            this.dispose();
            other.get();
            return cleanup;
          }
        },
        { sync: true },
      );

      source.set(1);
      expect(cleanup).toHaveBeenCalledOnce();
      source.set(2);
      other.set(1);
      stop();
      expect(spy.mock.calls).toEqual([[0], [1]]);
      expect(cleanup).toHaveBeenCalledOnce();
    });

    it("does not run the callback when cleanup cancels the watch", () => {
      const source = writable(0);
      const spy = vi.fn();
      const cleanup = vi.fn();
      const stop = watch(
        function () {
          spy(source.get());
          return () => {
            cleanup();
            this.dispose();
          };
        },
        { sync: true },
      );

      source.set(1);
      source.set(2);
      stop();
      expect(spy.mock.calls).toEqual([[0]]);
      expect(cleanup).toHaveBeenCalledOnce();
    });
  });

  describe("source disposal", () => {
    it("keeps a disposed source readable and continues observing other dependencies", async () => {
      const source = writable(0);
      const other = writable(0);
      const spy = vi.fn();
      const cleanup = vi.fn();
      const stop = watch(() => {
        spy(source.get(), other.get());
        return cleanup;
      });

      source.set(1);
      source.dispose();
      await tick();
      expect(source.get()).toBe(1);
      expect(spy.mock.calls).toEqual([[0, 0]]);
      expect(cleanup).not.toHaveBeenCalled();

      other.set(1);
      await tick();
      expect(spy.mock.calls).toEqual([
        [0, 0],
        [1, 1],
      ]);
      expect(cleanup).toHaveBeenCalledOnce();
      stop();
      other.set(2);
      await tick();
      expect(spy).toHaveBeenCalledTimes(2);
      expect(cleanup).toHaveBeenCalledTimes(2);
    });

    it("preserves remaining dependencies when the source is disposed during a callback", () => {
      const source = writable(0);
      const other = writable(0);
      const spy = vi.fn();
      const stop = watch(
        () => {
          const value = source.get();
          if (value === 1) source.dispose();
          spy(value, other.get());
        },
        { sync: true },
      );

      source.set(1);
      other.set(1);
      expect(spy.mock.calls).toEqual([
        [0, 0],
        [1, 0],
        [1, 1],
      ]);
      stop();
      other.set(2);
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it("releases a disposed source after all downstream watches are stopped", async () => {
      const { source, stopFirst, stopSecond } = (() => {
        const source = writable(0);
        const stopFirst = watch(
          () => {
            source.get();
          },
          { sync: true },
        );
        const stopSecond = watch(
          () => {
            source.get();
          },
          { sync: true },
        );
        source.dispose();
        return { source: new WeakRef(source), stopFirst, stopSecond };
      })();

      stopFirst();
      await new Promise<void>((resolve) => setImmediate(resolve));
      globalThis.gc!();
      expect(source.deref()?.get()).toBe(0);

      stopSecond();
      await new Promise<void>((resolve) => setImmediate(resolve));
      globalThis.gc!();
      expect(source.deref()).toBeUndefined();
      expect(() => stopFirst()).not.toThrow();
      expect(() => stopSecond()).not.toThrow();
    });
  });
});
