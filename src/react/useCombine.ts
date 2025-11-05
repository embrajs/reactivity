import {
  combine,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type Readable,
  type Config,
  type MapReadablesToValues,
  type OwnedReadable,
  type ReadableLike,
  strictEqual,
} from "@embra/reactivity";
import { useMemo, useRef } from "react";

import { type ReadableImpl } from "../readable";
import { useIsomorphicLayoutEffect } from "./utils";

export interface UseCombine {
  /**
   * Combines an array of {@link ReadableLike}s into a single {@link Readable} with the array of values.
   * @param deps An array of {@link ReadableLike}s to combine. It follows the React rules of hooks where the length of the array must remain constant.
   * @returns A {@link Readable} with the combined values.
   */
  <TDeps extends readonly ReadableLike[]>(deps: TDeps): OwnedReadable<MapReadablesToValues<TDeps>>;
  /**
   * Combines an array of {@link ReadableLike}s into a single {@link Readable} with transformed value.
   * @param deps - An array of {@link ReadableLike}s to combine. It follows the React rules of hooks where the length of the array must remain constant.
   * @param transform - A pure function that takes multiple values and returns a new value.
   * @param config - Optional custom {@link Config}.
   * @returns An {@link OwnedReadable} with the transformed values.
   */
  <TDeps extends readonly ReadableLike[], TValue>(
    deps: TDeps,
    transform: (...deps: MapReadablesToValues<TDeps>) => TValue,
    config?: Config<TValue>,
  ): OwnedReadable<TValue>;
}

/**
 * Combines an array of {@link ReadableLike}s into a single {@link Readable} with transformed value.
 *
 * Note that changes to `transform` and `config` will not trigger re-derivation; `useCombine` always uses the latest `transform` and `config` in the derivation.
 *
 * @category Hooks
 * @param deps - An array of {@link ReadableLike}s to combine. It follows the React rules of hooks where the length of the array must remain constant.
 * @param transform - Optional pure function that takes multiple values and returns a new value.
 * @param config - Optional custom {@link Config}.
 * @returns An {@link OwnedReadable} with the transformed values.
 *
 * @example
 * ```tsx
 * import { useCombine, useValue } from "@embra/reactivity/react";
 *
 * function App({ width$, height$ }) {
 *   const size$ = useCombine(
 *     [width$, height$],
 *     ([width, height]) => ({ width, height }),
 *     { equal: (s1, 22) => s1.width === s2.width && s1.height === s2.height }
 *   );
 *   const size = useValue(size$);
 * }
 * ```
 */
export const useCombine: UseCombine = <TDeps extends readonly ReadableLike[], TValue>(
  deps: TDeps,
  transform?: (...deps: MapReadablesToValues<TDeps>) => TValue,
  config?: Config<TValue>,
): OwnedReadable<TValue> => {
  const transformRef = useRef(transform);
  const computed = useMemo(
    () =>
      combine(
        deps,
        (...deps) => (transformRef.current ? transformRef.current(...deps) : (deps as unknown as TValue)),
        config,
      ),
    deps,
  );
  useIsomorphicLayoutEffect(() => {
    transformRef.current = transform;
    (computed as ReadableImpl).name = config?.name;
    (computed as ReadableImpl).equal_ = (config?.equal ?? strictEqual) || undefined;
  }, [transform, config]);
  return computed;
};
