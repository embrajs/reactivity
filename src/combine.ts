import { compute } from "./compute";
import { type Config, type OwnedReadable, type ReadableLike } from "./interface";

export type MapReadablesToValues<TDepValues extends readonly ReadableLike[]> = {
  [K in keyof TDepValues]: TDepValues[K] extends ReadableLike<infer V> ? V : never;
};

export interface Combine {
  /**
   * Combines an array of {@link ReadableLike}s into a single {@link Readable} with the array of values.
   * @param deps An array of {@link ReadableLike}s to combine.
   * @returns A {@link Readable} with the combined values.
   */
  <TDeps extends readonly ReadableLike[] = ReadableLike[]>(deps: TDeps): OwnedReadable<MapReadablesToValues<TDeps>>;
  /**
   * Combines an array of {@link ReadableLike}s into a single {@link Readable} with transformed value.
   * @param deps - An array of {@link ReadableLike}s to combine.
   * @param transform - A pure function that takes multiple values and returns a new value.
   * @param config - Optional custom {@link Config}.
   * @returns A {@link Readable} with the transformed values.
   */
  <TDeps extends readonly ReadableLike[] = ReadableLike[], TValue = any>(
    deps: TDeps,
    transform: (...deps: MapReadablesToValues<TDeps>) => TValue,
    config?: Config<TValue>,
  ): OwnedReadable<TValue>;
}

/**
 * Combine an array of {@link ReadableLike}s into a single {@link Readable} with transformed value.
 *
 * Unlike `compute`, the signature of the `transform` function is pure,
 * which makes it easier to reuse functions that are not aware of the reactive system.
 *
 * @function
 * @category Derivations
 * @param deps - An array of {@link ReadableLike}s to combine.
 * @param transform - Optional pure function that takes multiple values and returns a new value.
 * @param config - Optional custom {@link Config}.
 * @returns A {@link OwnedReadable} with transformed value.
 *
 * @example
 * ```ts
 * import { combine, writable } from "@embra/reactivity";
 *
 * const v1$ = writable(0);
 * const v2$ = writable(0);
 *
 * const combined$ = combine([v1$, v2$], (v1, v2) => v1 + v2);
 * ```
 */
export const combine: Combine = <TDeps extends readonly ReadableLike[], TValue = any>(
  deps: TDeps,
  transform?: (...deps: MapReadablesToValues<TDeps>) => TValue,
  config?: Config<TValue>,
) =>
  compute(
    get => (transform ? transform(...(deps.map(get) as MapReadablesToValues<TDeps>)) : (deps.map(get) as TValue)),
    config,
  );
