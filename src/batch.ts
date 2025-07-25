import { UNIQUE_VALUE } from "./utils";

export const BATCH_SCOPE = /* @__PURE__ */ Symbol.for("[@embra/reactivity/batch]");
export type BATCH_SCOPE = typeof BATCH_SCOPE;

declare const globalThis: {
  [BATCH_SCOPE]?: boolean;
};

export type BatchTask<O extends object = object> = O & {
  [BATCH_SCOPE]: () => void;
};

export const tasks = /* @__PURE__ */ new Set<BatchTask>();

export const toTask = <T extends object>(target: T, fn: () => void): BatchTask<T> => (
  ((target as BatchTask)[BATCH_SCOPE] = fn), target as BatchTask<T>
);

export const batchStart = (): boolean => (globalThis[BATCH_SCOPE] ? false : (globalThis[BATCH_SCOPE] = true));

export const batchFlush = (): void => {
  if (globalThis[BATCH_SCOPE]) {
    let error: unknown = UNIQUE_VALUE;
    for (const task of tasks) {
      tasks.delete(task);
      try {
        task[BATCH_SCOPE]();
      } catch (e) {
        error = e;
      }
    }

    globalThis[BATCH_SCOPE] = false;

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
