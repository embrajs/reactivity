import { type BRAND } from "./utils";

/**
 * Custom config for the Readable/Writable.
 */
export interface Config<TValue = any> {
  /**
   * Compare two values. Default `Object.is`.
   * `false` to disable equality check.
   */
  readonly equal?: Equal<TValue> | false;
  /**
   * Name for debugging.
   */
  readonly name?: string;
}

export type Disposer = () => void;

export type Equal<TValue = any> = (newValue: TValue, oldValue: TValue) => boolean;

export interface Get {
  <T = any>($: Readable<T>): T;
  <T = any>($?: Readable<T>): T | undefined;
  <T = any>($: T): Unwrap<T>;
  <T = any>($?: T): undefined | Unwrap<T>;
}

/**
 * A Readable is a reactive value that can be read and subscribed to.
 */
export interface Readable<TValue = any> {
  /**
   * A version representation of the value.
   * If two versions of a $ is not equal(`Object.is`), it means the `value` has changed (event if the `value` is equal).
   */
  readonly $version: Version;
  /**
   * @internal
   */
  readonly [BRAND]: BRAND;
  /**
   * Current value of the $.
   */
  readonly value: TValue;
  /**
   * Get current value.
   */
  get: () => TValue;
  /** @internal */
  onReaction_(subscriber: Subscriber<TValue>): void;
  /**
   * Subscribe to value changes without immediate emission.
   * @param subscriber
   * @returns a disposer function that cancels the subscription
   */
  reaction(subscriber: Subscriber<TValue>): Disposer;
  /**
   * Subscribe to value changes with immediate emission.
   * @param subscriber
   * @returns a disposer function that cancels the subscription
   */
  subscribe(subscriber: Subscriber<TValue>): Disposer;
  /**
   * Remove the given subscriber or all subscribers if no subscriber is provided.
   * @param subscriber Optional subscriber function to remove.
   * If not provided, all subscribers will be removed.
   */
  unsubscribe(subscriber?: (...args: any[]) => any): void;
}

export interface OwnedReadable<TValue = any> extends Readable<TValue> {
  /**
   * Remove all subscribers and lock.
   */
  dispose(): void;
}

export type SetValue<TValue = any> = (value: TValue) => void;

export type Subscriber<TValue = any> = (newValue: TValue) => void;

export type Unwrap<T> = T extends Readable<infer TValue> ? TValue : T;

export type Version = number;

/**
 * A Readable with a writable `value` property and a `set` method.
 */
export interface Writable<TValue = any> extends Readable<TValue> {
  /** Current value of the Writable */
  value: TValue;
  /** Set new value */
  set: (value: TValue) => void;
}

export interface OwnedWritable<TValue = any> extends Writable<TValue> {
  /**
   * Remove all subscribers and lock.
   */
  dispose(): void;
}
