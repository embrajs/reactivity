import { ReadableImpl } from "./readable";
import { type Config, type Get, type OwnedReadable, type Readable } from "./typings";
import { isReadable } from "./utils";

export interface ComputeFn<TValue> {
  (get: Get): TValue;
}

export const compute = <TValue>(fn: ComputeFn<TValue>, config?: Config<TValue>): OwnedReadable<TValue> => {
  let running: boolean | undefined;

  const get = <T = any>($?: Readable<T> | T | { $: Readable<T> }): T | undefined => {
    if (!isReadable($)) {
      return $ as T | undefined;
    }

    self.addDep_($ as ReadableImpl);

    return $.get();
  };

  const self = new ReadableImpl(self => {
    const isFirst = !running;
    running = true;

    if (isFirst && self.deps_?.size) {
      for (const dep of self.deps_.keys()) {
        self.removeDep_(dep);
      }
    }

    try {
      return fn(get);
    } finally {
      if (isFirst) {
        running = false;
      }
    }
  }, config);

  return self;
};
