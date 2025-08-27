import { type Config, type MapReadablesToValues, type ReadableLike } from "@embra/reactivity";

import { useCombine } from "./useCombine";
import { useValue } from "./useValue";

export interface UseCombined {
  /**
   * Combines an array of {@link ReadableLike}s into an array of values.
   * @param deps An array of {@link ReadableLike}s to combine.
   * @returns The combined values.
   */
  <TDeps extends readonly ReadableLike[]>(deps: TDeps): MapReadablesToValues<TDeps>;
  /**
   * Combines an array of {@link ReadableLike}s into a transformed value.
   * @param deps An array of {@link ReadableLike}s to combine.
   * @param transform A pure function that takes an array of values and returns a new value.
   * @param config custom config for the combined Readable.
   * @returns The transformed values.
   */
  <TDeps extends readonly ReadableLike[], TValue>(
    deps: TDeps,
    transform: (deps: MapReadablesToValues<TDeps>) => TValue,
    config?: Config<TValue>,
  ): TValue;
}

/**
 * Combines an array of {@link ReadableLike}s into a transformed value.
 *
 * Note that changes to `transform` and `config` will not trigger re-derivation, and `useCombine` always uses the latest `transform` and `config` in the derivation.
 * In other words, no extra care is needed to use this in React components. All args will be updated properly.
 *
 * @example
 * ```jsx
 * import { useCombined } from "@embra/reactivity/react";
 *
 * function App({ width$, height$ }) {
 *   const size = useCombined(
 *     [width$, height$],
 *     ([width, height]) => ({ width, height }),
 *     { equal: (s1, 22) => s1.width === s2.width && s1.height === s2.height }
 *   );
 * }
 * ```
 */
export const useCombined: UseCombined = <TDeps extends readonly ReadableLike[], TValue>(
  deps: TDeps,
  transform?: (deps: MapReadablesToValues<TDeps>) => TValue,
  config?: Config<TValue>,
): TValue => useValue(useCombine(deps, transform!, config));
