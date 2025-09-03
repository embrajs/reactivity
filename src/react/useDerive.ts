import {
  derive,
  strictEqual,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type Readable,
  type Config,
  type OwnedReadable,
  type ReadableLike,
  getReadable,
  isReadable,
} from "@embra/reactivity";
import { useMemo, useRef } from "react";

import { type ReadableImpl } from "../readable";
import { useIsomorphicLayoutEffect } from "./utils";

export interface UseDerive {
  /**
   * Derive a new {@link Readable} with same value from the given {@link ReadableLike}.
   * @param dep - The {@link ReadableLike} to derive from.
   * @returns A {@link Readable} with same value as the given {@link ReadableLike}.
   */
  <TDepValue, TValue>(dep: ReadableLike<TDepValue>): OwnedReadable<TValue>;
  /**
   * Derive a new {@link Readable} with same value from the given {@link ReadableLike}.
   * @param dep - The {@link ReadableLike} to derive from, or a non-Readable value that will be returned as-is.
   * @returns A {@link Readable} with same value as the given {@link ReadableLike}, or `dep` itself if `dep` is not a {@link ReadableLike}.
   */
  <TDepValue, TValue, U>(dep: ReadableLike<TDepValue> | U): OwnedReadable<TValue> | U;
  /**
   * Derive a new {@link Readable} with transformed value from the given {@link ReadableLike}.
   * @param dep - The {@link ReadableLike} to derive from.
   * @param transform A pure function that takes an input value and returns a new value.
   * @param config custom config for the derived {@link Readable}.
   * @returns A {@link Readable} with transformed value from the given {@link ReadableLike}.
   */
  <TDepValue, TValue>(
    dep: ReadableLike<TDepValue>,
    transform: (depValue: TDepValue) => TValue,
    config?: Config<TValue>,
  ): OwnedReadable<TValue>;
  /**
   * Derive a new {@link Readable} with transformed value from the given {@link ReadableLike}.
   * @param dep - The {@link ReadableLike} to derive from, or a non-Readable value that will be returned as-is.
   * @param transform A pure function that takes an input value and returns a new value.
   * @param config custom config for the derived {@link Readable}.
   * @returns A {@link Readable} with transformed value from the given {@link ReadableLike}, or `dep` itself if `dep` is not a {@link ReadableLike}.
   */
  <TDepValue, TValue, U>(
    dep: ReadableLike<TDepValue> | U,
    transform: (depValue: TDepValue) => TValue,
    config?: Config<TValue>,
  ): OwnedReadable<TValue> | U;
}

/**
 * Derive a new {@link Readable} from the given {@link ReadableLike}.
 *
 * Note that changes to `transform` and `config` will not trigger re-derivation, and `useDerive` always uses the latest `transform` and `config` in the derivation.
 * In other words, no extra care is needed to use this in React components. All args will be updated properly.
 *
 * @example
 * ```tsx
 * import { useDerive, useValue } from "@embra/reactivity/react";
 *
 * function App({ position3d$ }) {
 *   const position2d$ = useDerive(
 *     position3d$,
 *     ({ x, y }) => ({ x, y }),
 *     { equal: (p1, p2) => p1.x === p2.x && p1.y === p2.y }
 *   );
 *   const position2d = useValue(position2d$);
 * }
 * ```
 */
export const useDerive: UseDerive = <TDepValue, TValue, U>(
  dep: ReadableLike<TDepValue> | U,
  transform?: (depValue: TDepValue) => TValue,
  config?: Config<TValue>,
): OwnedReadable<TValue> | U => {
  const transformRef = useRef(transform);
  const computed = useMemo(() => {
    const $ = getReadable(dep);
    return $
      ? derive(
          $,
          depValue => (transformRef.current ? transformRef.current(depValue) : (depValue as unknown as TValue)),
          config,
        )
      : (dep as U);
  }, [dep]);
  useIsomorphicLayoutEffect(() => {
    transformRef.current = transform;
    if (isReadable(computed)) {
      (computed as ReadableImpl).name = config?.name;
      (computed as ReadableImpl).equal_ = (config?.equal ?? strictEqual) || undefined;
    }
  }, [transform, config]);
  return computed;
};
