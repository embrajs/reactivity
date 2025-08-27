import { compute } from "./compute";
import { type ReadableLike, type Config, type OwnedReadable } from "./typings";

export interface Derive {
  /**
   * Derive a new {@link Readable} with same value from the given {@link ReadableLike}.
   * @param dep - The {@link ReadableLike} to derive from.
   * @returns A {@link Readable} with same value as the given {@link ReadableLike}.
   */
  <TDepValue, TValue>(dep: ReadableLike<TDepValue>): OwnedReadable<TValue>;
  /**
   * Derive a new {@link Readable} with transformed value from the given {@link ReadableLike}.
   * @param dep - The {@link ReadableLike} to derive from.
   * @param transform A pure function that takes an input value and returns a new value.
   * @param config custom config for the combined {@link Readable}.
   * @returns A {@link Readable} with transformed value from the given {@link ReadableLike}.
   */
  <TDepValue, TValue>(
    dep: ReadableLike<TDepValue>,
    transform: (depValue: TDepValue) => TValue,
    config?: Config<TValue>,
  ): OwnedReadable<TValue>;
}

export const derive: Derive = <TDepValue, TValue>(
  dep: ReadableLike<TDepValue>,
  transform?: (depValue: TDepValue) => TValue,
  config?: Config<TValue>,
) => compute(get => (transform ? transform(get(dep)) : (get(dep) as unknown as TValue)), config);
