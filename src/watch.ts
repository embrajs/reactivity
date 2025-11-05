import { batch, batchFlush, batchStart, batchTasks } from "./batch";
import { type Disposer, type Get, type Readable, type ReadableLike } from "./interface";
import { getReadable, unsubscribe } from "./utils";

export interface WatchEffect {
  (get: Get, dispose: Disposer): (() => void) | undefined | void;
}

/**
 * Watch a reactive effect and re-run it when its dependencies change.
 *
 * @category SideEffects
 * @param effect - The reactive effect to watch.
 * @returns A disposer function to stop watching the effect.
 *
 * @example
 * ```ts
 * import { watch, writable, reactiveMap } from "./watch";
 *
 * const count$ = writable(0);
 * const map$ = reactiveMap();
 *
 * watch((get) => {
 *   console.log(get(count$));
 *   console.log(get(map$).get("key"));
 * });
 * ```
 */
export const watch = (effect: WatchEffect): Disposer => {
  let running: boolean | undefined;
  let disposed: boolean | undefined;
  let collectedDeps: Set<Readable> | undefined;

  let cleanupEffect: Disposer | null | undefined | void;

  const get: Get = ($?: ReadableLike): unknown => {
    const readable = getReadable($);
    if (!readable) return $;

    if (!collectedDeps?.has(readable)) {
      (collectedDeps ??= new Set()).add(readable);
      readable.onReaction_(subscription);
    }

    return readable.get();
  };

  const subscription = () => {
    /** c8 ignore else -- @preserve */
    if (!running) {
      unsubscribe(collectedDeps, subscription);
      collectedDeps?.clear();
    }
    batchTasks.add(runner);
  };

  const dispose = () => {
    disposed = true;
    batchTasks.delete(runner);
    effect = null as any; // enable gc
    unsubscribe(collectedDeps, subscription);
    collectedDeps = undefined;
    if (cleanupEffect) {
      const cleanup = cleanupEffect;
      cleanupEffect = null;
      batch(cleanup);
    }
  };

  const runner = () => {
    if (cleanupEffect) {
      const cleanup = cleanupEffect;
      cleanupEffect = null;
      batch(cleanup);
    }

    if (disposed) {
      return;
    }

    const isTopRunner = !running;
    running = true;

    const isBatchTop = batchStart();

    try {
      cleanupEffect = effect(get, dispose);
    } catch (e) {
      unsubscribe(collectedDeps, subscription);
      collectedDeps?.clear();
      throw e;
    } finally {
      if (disposed) {
        dispose();
      }

      /** c8 ignore else -- @preserve */
      if (isTopRunner) {
        running = false;
      }

      isBatchTop && batchFlush();
    }
  };
  runner.batchTask_ = runner;

  runner();

  return dispose;
};
