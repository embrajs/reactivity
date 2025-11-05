import { ReadableImpl } from "./readable";
import { type ReadableLike, type Config, type Get, type OwnedReadable } from "./typings";
import { getReadable } from "./utils";

export interface ComputeFn<TValue = any> {
  (get: Get): TValue;
}

/**
 * Computes a derived value based on other Readables.
 *
 * @param fn - The function that computes the value.
 * @param config - Optional custom {@link Config}.
 * @returns An {@link OwnedReadable} that computes its value based on other Readables.
 *
 * @example
 * ```ts
 * import { compute, writable, reactiveMap } from "@embra/reactivity";
 *
 * const v1$ = writable(0);
 * const v2$ = writable(1);
 * const map$ = reactiveMap([["s", 42]]);
 *
 * const sum$ = compute(get => get(v1$) + get(v2$) + get(map$).get("s") || 0);
 * ```
 */
export const compute = <TValue>(fn: ComputeFn<TValue>, config?: Config<TValue>): OwnedReadable<TValue> => {
  let running: boolean | undefined;

  const get: Get = ($?: ReadableLike): unknown => {
    const readable = getReadable($);
    if (!readable) return $;

    self.addDep_(readable as ReadableImpl);

    return readable.get();
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
