import { batch, batchFlush, batchStart, tasks } from "./batch";
import { type ReadableLike, type Disposer, type Get, type Readable } from "./typings";
import { isReadable, unsubscribe } from "./utils";

export interface WatchEffect {
  (get: Get, dispose: Disposer): (() => void) | undefined | void;
}

export const watch = (effect: WatchEffect): Disposer => {
  let running: boolean | undefined;
  let disposed: boolean | undefined;
  let collectedDeps: Set<Readable> | undefined;

  let cleanupEffect: Disposer | null | undefined | void;

  const get: Get = ($?: ReadableLike): unknown => {
    if (!isReadable($)) {
      if (!isReadable($?.$)) {
        return $;
      }
      $ = $.$;
    }

    if (!collectedDeps?.has($)) {
      (collectedDeps ??= new Set()).add($);
      $.onReaction_(subscription);
    }

    return $.get();
  };

  const subscription = () => {
    if (!running) {
      unsubscribe(collectedDeps, subscription);
      collectedDeps?.clear();
    }
    tasks.add(runner);
  };

  const dispose = () => {
    disposed = true;
    tasks.delete(runner);
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

      if (isTopRunner) {
        running = false;
      }

      isBatchTop && batchFlush();
    }
  };
  runner.task_ = runner;

  runner();

  return dispose;
};
