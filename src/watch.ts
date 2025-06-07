import { batch, batchFlush, batchStart, dirtyVals } from "./batch";
import { type Get, type ReadonlyVal, type ValDisposer } from "./typings";
import { identity, isVal, unsubscribe } from "./utils";

export interface WatchEffect {
  (get: Get, dispose: ValDisposer): (() => void) | undefined | void;
}

export const watch = (effect: WatchEffect): ValDisposer => {
  let running: boolean | undefined;
  let disposed: boolean | undefined;
  let collectedDeps: Set<ReadonlyVal> | undefined;

  let cleanupEffect: null | undefined | ValDisposer | void;

  const get = <T = any>(val$?: null | ReadonlyVal<T> | undefined): T | undefined => {
    if (!isVal(val$)) {
      return val$ as T | undefined;
    }

    if (!collectedDeps?.has(val$)) {
      (collectedDeps ??= new Set()).add(val$);
      val$.onReaction_(subscription);
    }

    return val$.get();
  };

  const subscription = () => {
    if (!running) {
      unsubscribe(collectedDeps, subscription);
      collectedDeps?.clear();
    }
    dirtyVals.add(runner);
  };

  const dispose = () => {
    disposed = true;
    dirtyVals.delete(runner);
    effect = identity;
    unsubscribe(collectedDeps, subscription);
    collectedDeps = undefined;
    if (cleanupEffect) {
      const cleanup = cleanupEffect;
      cleanupEffect = null;
      batch(cleanup);
    }
  };

  const runner = () => {
    if (disposed) {
      return;
    }

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

  runner();

  return dispose;
};
