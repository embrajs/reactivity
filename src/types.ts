import { CONTRACT_SYMBOL, type CONTRACT_VERSION } from "./constants";

/**
 * Disposes an effect, subscription, or owned reactive resource.
 *
 * @category Effects & Scheduling
 */
export type Cleanup = () => void;

/**
 * A pure equivalence relation. It must not mutate reactive state.
 *
 * @category Utilities
 */
export type Equality<T = any> = (previous: T, next: T) => boolean;

export type NormalizedEquality<T> = Equality<T> | false | null;

/**
 * Equality configuration for a reactive value or computed node:
 * - A custom {@link Equality} function.
 * - `false` to disable equality checks and always propagate writes.
 * - `null` or `undefined` to use `Object.is` (default).
 *
 * @category Utilities
 */
export type EqualityConfig<T> = Equality<T> | false | null | undefined;

/**
 * Setter function returned by {@link readable} or exposed on {@link Writable}.
 *
 * @category Primitives
 */
export type Setter<T = any> = (value: T) => void;

/**
 * A reactive resource that owns graph resources and must be disposed when no longer needed.
 *
 * @category Primitives
 */
export type Owned<T> = T & {
  /**
   * Disconnects this resource from the reactive graph while preserving its last
   * value as a frozen input. Callers must not write to a disposed source.
   */
  dispose(): void;
  /** Alias for {@link dispose} supporting explicit resource management (`using`). */
  [Symbol.dispose](): void;
};

/**
 * Configuration options for {@link readable}, {@link computed}, and {@link derived}.
 *
 * @category Primitives
 */
export interface ReadableOptions<T> {
  /** Optional debug label for the node. */
  name?: string;
  /** Equality configuration for change detection. Defaults to `Object.is`. */
  equal?: EqualityConfig<T>;
}

/**
 * Configuration options for {@link writable}.
 *
 * @category Primitives
 */
export type WritableOptions<T> = ReadableOptions<T>;

/**
 * Execution context passed as `this` to {@link WatchEffect} and {@link Subscriber} callbacks.
 *
 * @category Effects & Scheduling
 */
export interface EffectContext {
  /** Disposes the current effect or subscription from within its callback. */
  dispose(): void;
}

/**
 * Effect callback passed to {@link watch}. May return a {@link Cleanup} function
 * that runs before the next execution or when the effect is disposed.
 *
 * @category Effects & Scheduling
 */
export type WatchEffect = (this: EffectContext) => undefined | Cleanup;

/**
 * Listener callback passed to {@link Readable.subscribe}.
 *
 * @category Effects & Scheduling
 */
export type Subscriber<T = any> = (this: EffectContext, value: T) => void;

/**
 * Scheduling options for {@link Readable.subscribe}.
 *
 * @category Effects & Scheduling
 */
export interface SubscribeOptions {
  /** Deliver notifications synchronously after the current batch instead of in a microtask. Defaults to `false`. */
  sync?: boolean;
  /** Deliver the current value immediately upon subscription. Defaults to `true`. */
  immediate?: boolean;
}

/**
 * A reactive value that can be read and subscribed to.
 *
 * @category Primitives
 */
export interface Readable<T = any> {
  [CONTRACT_SYMBOL]: CONTRACT_VERSION;
  /** Current value. Reading inside {@link computed} or {@link watch} tracks this source as a dependency. */
  readonly value: T;
  /** Returns the current value. Tracks this source as a dependency when called inside {@link computed} or {@link watch}. */
  get(): T;
  /**
   * Subscribes to value changes on this source.
   *
   * Shares a consumed-value baseline and broadcast value with subscriptions to
   * this source in the same scheduling mode. Joining pending work can cause an
   * additional callback for existing subscribers.
   */
  subscribe(fn: Subscriber<T>, options?: SubscribeOptions): Cleanup;
  /** Returns the JSON representation of the current value. */
  toJSON(key?: string): unknown;
  /** Returns the string representation of the current value. */
  toString(): string;
  /** Returns the current primitive value. */
  valueOf(): T;
}

/**
 * A {@link Readable} whose value can also be updated directly.
 *
 * @category Primitives
 */
export interface Writable<T = any> extends Readable<T> {
  /** Current value. Assigning updates the value and notifies dependents if changed. */
  value: T;
  /** Bound setter function that updates the value and notifies dependents if changed. */
  set: Setter<T>;
}
