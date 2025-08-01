import { compute } from "./compute";
import { type Config, type OwnedReadable, type Readable } from "./typings";

export type MapReadablesToValues<TDepValues extends readonly Readable[]> = {
  [K in keyof TDepValues]: TDepValues[K] extends Readable<infer V> ? V : never;
};

export interface Combine {
  /**
   * Combines an array of Readables into a single Readable with the array of values.
   * @param deps An array of Readables to combine.
   * @returns A Readable with the combined values.
   */
  <TDep$s extends readonly Readable[] = Readable[]>(deps: TDep$s): OwnedReadable<MapReadablesToValues<TDep$s>>;
  /**
   * Combines an array of Readables into a single Readable with transformed value.
   * @param deps An array of Readables to combine.
   * @param transform A pure function that takes an array of values and returns a new value.
   * @param config custom config for the combined Readable.
   * @returns A Readable with the transformed values.
   */
  <TDep$s extends readonly Readable[] = Readable[], TValue = any>(
    deps: TDep$s,
    transform: (deps: MapReadablesToValues<TDep$s>) => TValue,
    config?: Config<TValue>,
  ): OwnedReadable<TValue>;
}

export const combine: Combine = <TDep$s extends readonly Readable[], TValue = any>(
  deps: TDep$s,
  transform?: (deps: MapReadablesToValues<TDep$s>) => TValue,
  config?: Config<TValue>,
) =>
  compute(
    get => (transform ? transform(deps.map(get) as MapReadablesToValues<TDep$s>) : (deps.map(get) as TValue)),
    config,
  );
