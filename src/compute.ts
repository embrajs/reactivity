import { ReadableImpl } from "./readable";
import { type Get, type Readable, type Config, type OwnedReadable } from "./typings";
import { isReadable } from "./utils";

export interface ComputeFn<TValue> {
  (get: Get): TValue;
}

export const compute = <TValue>(fn: ComputeFn<TValue>, config?: Config<TValue>): OwnedReadable<TValue> => {
  let running: boolean | undefined;

  let self: ReadableImpl<TValue>;

  const get = <T = any>($?: Readable<T> | T | { $: Readable<T> }): T | undefined => {
    if (!isReadable($)) {
      return $ as T | undefined;
    }

    self.addDep_($ as ReadableImpl);

    return $.get();
  };

  return new ReadableImpl(v => {
    self = v;

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
};
