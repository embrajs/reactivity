import { compute } from "./compute";
import { type Config, type OwnedReadable, type Readable } from "./typings";

export interface Derive {
  /**
   * Derive a new Readable with same value from the given Readable.
   * @param dep$ - The Readable to derive from.
   * @param config - Custom config for the derived Readable.
   * @returns A Readable with same value as the given Readable.
   */
  <TDepValue = any, TValue = any>(dep$: Readable<TDepValue>): OwnedReadable<TValue>;
  /**
   * Derive a new Readable with transformed value from the given Readable.
   * @param dep$ - The Readable to derive from.
   * @param transform A pure function that takes an input value and returns a new value.
   * @param config custom config for the combined Readable.
   * @returns A Readable with transformed value from the given Readable.
   */
  <TDepValue = any, TValue = any>(
    dep$: Readable<TDepValue>,
    transform: (depValue: TDepValue) => TValue,
    config?: Config<TValue>,
  ): OwnedReadable<TValue>;
}

export const derive: Derive = <TDepValue, TValue>(
  dep$: Readable<TDepValue>,
  transform?: (depValue: TDepValue) => TValue,
  config?: Config<TValue>,
) => compute(get => (transform ? transform(get(dep$)) : (get(dep$) as unknown as TValue)), config);
