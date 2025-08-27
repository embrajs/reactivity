import {
  type Config,
  type ReadableLike,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type Readable,
} from "@embra/reactivity";

import { useDerive } from "./useDerive";
import { useValue } from "./useValue";

export interface UseDerived {
  /**
   * Derive a new {@link Readable} with transformed value from the given {@link ReadableLike}.
   * @param dep - The {@link ReadableLike} to derive from.
   * @param transform A pure function that takes an input value and returns a new value.
   * @param config custom config for the combined {@link Readable}.
   * @returns Transformed value from the given {@link ReadableLike}.
   */
  <TDepValue, TValue>(
    dep: ReadableLike<TDepValue>,
    transform: (depValue: TDepValue) => TValue,
    config?: Config<TValue>,
  ): TValue;
  /**
   * Derive a new {@link Readable} with transformed value from the given {@link ReadableLike}.
   * @param dep - The {@link ReadableLike} to derive from, or a non-Readable value that will be returned as-is.
   * @param transform A pure function that takes an input value and returns a new value.
   * @param config custom config for the combined {@link Readable}.
   * @returns Transformed value from the given {@link ReadableLike}, or `dep` itself if `dep` is not a {@link ReadableLike}.
   */
  <TDepValue, TValue, U>(
    dep: ReadableLike<TDepValue> | U,
    transform: (depValue: TDepValue) => TValue,
    config?: Config<TValue>,
  ): TValue | U;
}

/**
 * Derive a new {@link Readable} from the given {@link ReadableLike}.
 *
 * Note that changes to `transform` and `config` will not trigger re-derivation, and `useDerive` always uses the latest `transform` and `config` in the derivation.
 * In other words, no extra care is needed to use this in React components. All args will be updated properly.
 *
 * @example
 * ```tsx
 * import { useDerived } from "@embra/reactivity/react";
 *
 * function App({ position3d$ }) {
 *   const position2d = useDerived(
 *     position3d$,
 *     ({ x, y }) => ({ x, y }),
 *     { equal: (p1, p2) => p1.x === p2.x && p1.y === p2.y }
 *   );
 * }
 * ```
 */
export const useDerived: UseDerived = <TDepValue, TValue, U>(
  dep: ReadableLike<TDepValue> | U,
  transform?: (depValue: TDepValue) => TValue,
  config?: Config<TValue>,
): TValue | U => useValue(useDerive(dep, transform!, config));
