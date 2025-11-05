import { compute } from "./compute";
import { type Config, type OwnedReadable, type ReadableLike } from "./typings";

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
   * @param deps An array of {@link ReadableLike}s to combine.
   * @param transform A pure function that takes an array of values and returns a new value.
   * @param config custom config for the combined Readable.
   * @returns A {@link Readable} with the transformed values.
   */
  <TDeps extends readonly ReadableLike[] = ReadableLike[], TValue = any>(
    deps: TDeps,
    transform: (deps: MapReadablesToValues<TDeps>) => TValue,
    config?: Config<TValue>,
  ): OwnedReadable<TValue>;
}

/**
 * Combine an array of {@link ReadableLike}s into a single {@link Readable} with transformed value.
 *
 * @param deps - An array of {@link ReadableLike}s to combine.
 * @param transform - A pure function that takes an array of values and returns a new value.
 * @param config - Optional custom {@link Config}.
 * @returns A {@link OwnedReadable} with transformed value.
 */
export const combine: Combine = <TDeps extends readonly ReadableLike[], TValue = any>(
  deps: TDeps,
  transform?: (deps: MapReadablesToValues<TDeps>) => TValue,
  config?: Config<TValue>,
) =>
  compute(
    get => (transform ? transform(deps.map(get) as MapReadablesToValues<TDeps>) : (deps.map(get) as TValue)),
    config,
  );
