import { context } from "./context";
import { UNIQUE_VALUE } from "./utils";

export type BatchTask<O extends object = object> = O & {
  task_: () => void;
};

export const tasks: Set<BatchTask> = /* @__PURE__ */ (() => context.tasks_)();

export const toTask = <T extends object>(target: T, fn: () => void): BatchTask<T> => (
  ((target as BatchTask).task_ = fn), target as BatchTask<T>
);

export const batchStart = (): boolean => !context.batching_ && (context.batching_ = true);

export const batchFlush = (): void => {
  if (context.batching_) {
    let error: unknown = UNIQUE_VALUE;
    for (const task of tasks) {
      tasks.delete(task);
      try {
        task.task_();
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
