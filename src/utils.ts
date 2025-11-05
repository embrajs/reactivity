import { type Writable, type Readable, type ReadableLike, type ReadableProvider } from "./interface";

export const BRAND = /* @__PURE__ */ Symbol.for("@embra/reactivity");
export type BRAND = typeof BRAND;

export const UNIQUE_VALUE: unique symbol = /* @__PURE__ */ Symbol();

export type UNIQUE_VALUE = typeof UNIQUE_VALUE;

/**
 * Remove the given subscriber.
 * Remove all if no subscriber provided.
 *
 * @category Readable
 * @param $
 * @param subscriber
 */
export const unsubscribe = (
  $: Iterable<Readable> | Readable | null | undefined,
  subscriber?: (...args: any[]) => any,
): void => {
  if ($) {
    if (isReadable($)) {
      $.unsubscribe(subscriber);
    } else {
      for (const v of $) {
        v.unsubscribe(subscriber);
      }
    }
  }
};

/**
 * `Object.is`
 *
 * @category Comparers
 */
export const strictEqual = Object.is;

/**
 * Shallow compare two arrays.
 *
 * @category Comparers
 * @param arrA - any value
 * @param arrB - any value
 * @returns `false` if any of:
 *          1. one of arrA or arrB is an array and the other is not
 *          2. arrA and arrB have different lengths
 *          3. arrA and arrB have different values at any index
 */
export const arrayShallowEqual = (arrA: any, arrB: any): boolean => {
  if (strictEqual(arrA, arrB)) {
    return true;
  }
  if (!Array.isArray(arrA) || !Array.isArray(arrB)) {
    return false;
  }
  const len = arrA.length;
  if (arrB.length !== len) {
    return false;
  }
  for (let i = 0; i < len; i++) {
    if (!strictEqual(arrA[i], arrB[i])) {
      return false;
    }
  }
  return true;
};

export interface IsReadable {
  ($: unknown): $ is Readable;
  ($: any): $ is Readable;
  <T extends Readable>($: T): $ is T extends Readable ? T : never;
}

/**
 * Checks if $ is is a {@link Readable}.
 *
 * Note that a {@link Writable} is also a {@link Readable}.
 *
 * @function
 * @category Readable
 * @returns `true` if $ is {@link Readable}.
 */
export const isReadable: IsReadable = ($: unknown): $ is Readable => ($ as Readable | undefined)?.[BRAND] === BRAND;

export interface IsWritable {
  ($: unknown): $ is Writable;
  ($: any): $ is Writable;
  <T extends Writable>($: T): $ is T extends Writable ? T : never;
}

/**
 * Checks if $ is is a {@link Writable}.
 *
 * @function
 * @category Writable
 * @returns `true` if $ is {@link Writable}.
 */
export const isWritable: IsWritable = ($: unknown): $ is Writable => isReadable($) && !!($ as Writable).set;

interface InvokeEach {
  (iterable: Iterable<() => any>): void;
  <T>(iterable: Iterable<(value: T) => any>, value: T): void;
}

export const invokeEach: InvokeEach = <T>(iterable: Iterable<(value?: T) => any>, value?: T) => {
  let error: unknown = UNIQUE_VALUE;
  for (const fn of iterable) {
    try {
      fn(value);
    } catch (e) {
      error = e;
    }
  }
  if (error !== UNIQUE_VALUE) {
    throw error;
  }
};

/**
 * Check if $ is a {@link ReadableProvider}.
 *
 * @category Readable
 * @param $ - The value to check.
 * @returns `true` if $ is a {@link ReadableProvider}.
 */
export const isReadableProvider = <T = any>($: any): $ is ReadableProvider<T> => isReadable($?.$);

/**
 * Check if $ is a {@link ReadableLike}.
 *
 * @category Readable
 * @param $ - The value to check.
 * @returns `true` if $ is a {@link ReadableLike}.
 */
export const isReadableLike = <T = any>($: any): $ is ReadableLike<T> => isReadable($) || isReadableProvider($);

/**
 * Get the {@link Readable} from a possible {@link ReadableLike}.
 *
 * @category Readable
 * @param $ - The value to extract the Readable from.
 * @returns The extracted {@link Readable} or `undefined` if not found.
 */
export const getReadable = <T = any>($: ReadableLike<T> | any): Readable<T> | undefined =>
  isReadable($) ? $ : isReadableProvider($) ? $.$ : undefined;
