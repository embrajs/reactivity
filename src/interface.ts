import { type Scheduler } from "./schedulers";
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
  /**
   * A callback invoked when a value is needed to be disposed.
   *
   * A value is considered for disposal when:
   * - it is replaced by another value (a new value is set).
   * - the Readable is disposed.
   *
   * @param oldValue The value that is needed to be disposed.
   */
  readonly onDisposeValue?: (oldValue: TValue) => void;
}

export type Disposer = () => void;

export type Equal<TValue = any> = (newValue: TValue, oldValue: TValue) => boolean;

export interface Get {
  <T = any>($: ReadableLike<T>): T;
  <T = any, U = any>($: ReadableLike<T> | U): T | U;
}

/**
 * A Readable is a reactive value that can be read and subscribed to.
 */
export interface Readable<TValue = any> {
  readonly name?: string;
  /**
   * A version representation of the value.
   * If two versions of a $ is not equal(`Object.is`), it means the `value` has changed (event if the `value` is equal).
   */
  readonly version: Version;
  /**
   * @internal
   */
  readonly [BRAND]: BRAND;
  /**
   * @internal
   */
  deps_?: Map<Readable, Version>;
  /**
   * Indicates whether the Readable has been disposed.
   */
  readonly disposed: boolean;
  /**
   * Current value of the $.
   */
  readonly value: TValue;
  /**
   * Get current value.
   */
  get: () => TValue;
  /** @internal */
  onReaction_(subscriber: Subscriber<TValue>, scheduler?: Scheduler): void;
  /**
   * Subscribe to value changes without immediate emission.
   * @param subscriber
   * @param scheduler Optional scheduler to control when the subscriber is called.
   * @returns a disposer function that cancels the subscription
   */
  reaction(subscriber: Subscriber<TValue>, scheduler?: Scheduler): Disposer;
  /**
   * Subscribe to value changes with immediate emission.
   * @param subscriber
   * @param scheduler Optional scheduler to control when the subscriber is called.
   * @returns a disposer function that cancels the subscription
   */
  subscribe(subscriber: Subscriber<TValue>, scheduler?: Scheduler): Disposer;
  /**
   * Remove the given subscriber or all subscribers if no subscriber is provided.
   * @param subscriber Optional subscriber function to remove.
   * @param scheduler Optional scheduler associated with the subscriber.
   * If not provided, all subscribers will be removed.
   */
  unsubscribe(subscriber?: (...args: any[]) => any, scheduler?: Scheduler): void;
}

/**
 * An OwnedReadable is a {@link Readable} with a `dispose` method that removes all subscribers and locks the Readable.
 */
export interface OwnedReadable<TValue = any> extends Readable<TValue> {
  /**
   * Remove all subscribers and lock.
   */
  dispose(): void;
}

/**
 * A Readable provider is an object that provides a {@link Readable} `$` property.
 */
export interface ReadableProvider<TValue = any> {
  readonly $: Readable<TValue>;
}

/**
 * A {@link Readable} or a {@link ReadableProvider}.
 */
export type ReadableLike<TValue = any> = Readable<TValue> | ReadableProvider<TValue>;

export type SetValue<TValue = any> = (value: TValue) => void;

export type Subscriber<TValue = any> = (newValue: TValue) => void;

export type Unwrap<T> = T extends ReadableLike<infer TValue> ? TValue : T;

export type Version = number;

/**
 * A Writable is a {@link Readable} with a writable `value` property and a `set` method that updates the value.
 */
export interface Writable<TValue = any> extends Readable<TValue> {
  /** Current value of the Writable */
  value: TValue;
  /** Set new value */
  set: (value: TValue) => void;
}

/**
 * An OwnedWritable is a {@link Writable} with a `dispose` method that removes all subscribers and locks the Writable.
 */
export interface OwnedWritable<TValue = any> extends Writable<TValue> {
  /**
   * Remove all subscribers and lock.
   */
  dispose(): void;
}
