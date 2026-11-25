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
  /**
   * Current value (shorthand for {@link get}).
   *
   * Reading inside {@link computed} or {@link watch} tracks this source as a
   * dependency. Use {@link untrack} to read without tracking.
   */
  readonly value: T;
  /**
   * Bound getter that returns the current value.
   *
   * Tracks this source as a dependency when called inside {@link computed} or
   * {@link watch}. Safe to pass around without a receiver.
   *
   * @example
   * ```ts
   * const count = writable(0);
   * const getCount = count.get;
   * getCount(); // 0
   * ```
   */
  get(): T;
  /**
   * Returns the current value without tracking this source as a dependency.
   *
   * Still evaluates lazy or dirty {@link computed} / {@link derived} nodes to
   * ensure the returned value is up to date. Defined on the prototype; call as
   * a method (`source.peek()`).
   *
   * @example
   * ```ts
   * const count = writable(0);
   * const trigger = writable(0);
   *
   * watch(() => {
   *   trigger.get(); // tracked
   *   console.log(count.peek()); // untracked
   * });
   * ```
   */
  peek(): T;
  /**
   * Subscribes to value changes on this source and returns a {@link Cleanup}
   * function to unsubscribe.
   *
   * By default, delivers the current value immediately (`immediate: true`) and
   * batches subsequent updates into a microtask (`sync: false`). Each
   * subscription tracks its own consumed-value baseline and reads the latest
   * value when its turn runs. Call `this.dispose()` inside `fn` to unsubscribe
   * from within the callback.
   *
   * @example
   * ```ts
   * const count = writable(0);
   * const stop = count.subscribe(
   *   (value) => console.log(value),
   *   { immediate: false },
   * );
   * count.set(1); // logs 1 in a microtask
   * stop();
   * ```
   */
  subscribe(fn: Subscriber<T>, options?: SubscribeOptions): Cleanup;
  /**
   * Returns the JSON representation of the current value (delegating to the
   * value's own `toJSON(key)` if present), allowing `JSON.stringify(source)`
   * to serialize the underlying value directly.
   *
   * Reads through {@link get}, so it tracks when called inside {@link computed}
   * or {@link watch}.
   */
  toJSON(key?: string): unknown;
  /**
   * Returns `String(this.get())`, allowing implicit string coercion such as
   * template literals (`` `${source}` ``).
   *
   * Reads through {@link get}, so it tracks when called inside {@link computed}
   * or {@link watch}.
   */
  toString(): string;
  /**
   * Returns the current value via {@link get}, enabling primitive coercion in
   * expressions.
   *
   * Reads through {@link get}, so it tracks when called inside {@link computed}
   * or {@link watch}.
   */
  valueOf(): T;
}

/**
 * A {@link Readable} whose value can also be updated directly.
 *
 * @category Primitives
 */
export interface Writable<T = any> extends Readable<T> {
  /**
   * Current value.
   *
   * Reading behaves like {@link get} and tracks inside {@link computed} or
   * {@link watch}. Assigning delegates to {@link set}, updating the value and
   * notifying dependents if changed according to the configured equality check.
   */
  value: T;
  /**
   * Bound setter that writes a new value and notifies dependents if changed
   * according to the configured equality check (`Object.is` by default).
   *
   * Safe to pass around without a receiver. Must not be called after
   * {@link Owned.dispose | dispose()} or during {@link computed} / {@link derived}
   * evaluation.
   *
   * @example
   * ```ts
   * const name = writable("");
   * input.addEventListener("input", () => name.set(input.value));
   * // Or pass directly as a callback:
   * onChange(name.set);
   * ```
   */
  set: Setter<T>;
  /**
   * Computes and writes the next value from the current value without tracking
   * this source as a dependency.
   *
   * Delegates the write to {@link set}. Useful inside {@link watch} to update
   * a value based on its previous value without creating a self-dependency.
   * Explicit reads of other sources inside `updater` are still tracked.
   *
   * Defined on the prototype; call as a method (`source.update(...)`).
   *
   * @example
   * ```ts
   * const count = writable(0);
   * const step = writable(1);
   *
   * watch(() => {
   *   // Tracks `step`, but does not track `count`.
   *   count.update((n) => n + step.get());
   * });
   * ```
   */
  update(updater: (value: T) => T): void;
}
