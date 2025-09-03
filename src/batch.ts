import { context } from "./context";
import { UNIQUE_VALUE } from "./utils";

export type BatchTask<O extends object = object> = O & {
  batchTask_: () => void;
};

export const batchTasks: Set<BatchTask> = /* @__PURE__ */ (() => context.batchTask_)();

export const batchStart = (): boolean => !context.batching_ && (context.batching_ = true);

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

export const batch = <T>(fn: () => T, thisArg?: any): T => {
  const isFirst = batchStart();

  try {
    return fn.call(thisArg);
  } finally {
    isFirst && batchFlush();
  }
};
