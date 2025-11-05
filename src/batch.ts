import { context } from "./context";
import { UNIQUE_VALUE } from "./utils";

export type BatchTask<O extends object = object> = O & {
  batchTask_: () => void;
};

export const batchTasks: Set<BatchTask> = /* @__PURE__ */ (() => context.batchTask_)();

/**
 * Manually starts a batch of updates without auto-flushing.
 * Use {@link batchFlush} to finish the batch.
 *
 * It is preferred to use the {@link batch} function instead.
 *
 * @category Batch
 * @returns A boolean indicating if this is the first batch trigger.
 *          If true, the caller should call {@link batchFlush} to finish the batch.
 *
 * @example
 * ```ts
 * import { batchStart, batchFlush, writable, compute} from "@embra/reactivity";
 *
 * const count$ = writable(0);
 * const double$ = compute(get => get(count$) * 2);
 *
 * const isFirst = batchStart();
 *
 * count$.set(1);
 * count$.set(2);
 *
 * if (isFirst) {
 *   batchFlush();
 * }
 * ```
 */
export const batchStart = (): boolean => !context.batching_ && (context.batching_ = true);

/**
 * Finishes a {@link batchStart} updates.
 *
 * It is preferred to use the {@link batch} function instead.
 *
 * @category Batch
 */
export const batchFlush = (): void => {
  if (context.batching_) {
    let error: unknown = UNIQUE_VALUE;
    for (const task of batchTasks) {
      batchTasks.delete(task);
      try {
        task.batchTask_();
      } catch (e) {
        error = e;
      }
    }

    context.batching_ = false;

    if (error !== UNIQUE_VALUE) {
      throw error;
    }
  }
};

/**
 * Creates a batch of updates. Computations within the batch are deferred until the batch completes.
 *
 * @category Batch
 * @param fn - The function containing updates to batch.
 * @param thisArg - The value to use as `this` when executing `fn`.
 * @returns The result of the function `fn`.
 *
 * @example
 * ```ts
 * import { batch, writable, compute } from "@embra/reactivity";
 *
 * const count$ = writable(0);
 * const double$ = compute(get => get(count$) * 2);
 *
 * batch(() => {
 *   count$.set(1);
 *   count$.set(2);
 * });
 * ```
 */
export const batch = <T>(fn: () => T, thisArg?: any): T => {
  const isFirst = batchStart();

  try {
    return fn.call(thisArg);
  } finally {
    isFirst && batchFlush();
  }
};
