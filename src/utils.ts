import { type $sValueTuple, type Readable, type Version } from "./typings";

export const BRAND = /* @__PURE__ */ Symbol.for("@embra/reactivity");
export type BRAND = typeof BRAND;

export const UNIQUE_VALUE: unique symbol = /* @__PURE__ */ Symbol();

export type UNIQUE_VALUE = typeof UNIQUE_VALUE;

/**
 * Remove the given subscriber.
 * Remove all if no subscriber provided.
 * @param $
 * @param subscriber
 */
export const unsubscribe = (
  $: Iterable<Readable> | Readable | null | undefined,
  subscriber: (...args: any[]) => any,
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

/** Returns the value passed in. */
export const identity = <TValue>(value: TValue): TValue => value;

/**
 * `Object.is`
 */
export const strictEqual = Object.is;

/**
 * Shallow compare two arrays.
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

const getValue = <TValue>($: Readable<TValue>): TValue => $.value;

export const getValues = <T extends readonly Readable[]>($s: T): [...$sValueTuple<T>] =>
  $s.map(getValue) as [...$sValueTuple<T>];

export const getVersion = ($: Readable): Version => $.$version;

interface IsReadable {
  <T extends Readable>($: T): $ is T;
  ($: unknown): $ is Readable;
  ($: any): $ is Readable;
}

/**
 * Checks if $ is is a Readable$.
 *
 * @returns `true` if $ is Readable$.
 */
export const isReadable: IsReadable = ($: unknown): $ is Readable => ($ as Readable | undefined)?.[BRAND] === BRAND;
