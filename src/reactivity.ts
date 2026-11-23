import { CONTRACT_SYMBOL, CONTRACT_VERSION, NodeFlags } from "./constants";
import { batch, ComputedNode, flush, readSource, runEffect, type Source, untrack, ValueNode, WatchNode } from "./node";
import { NOOP_, runtime } from "./runtime";

import type {
  Cleanup,
  Owned,
  Readable,
  ReadableOptions,
  Setter,
  WatchEffect,
  Writable,
  WritableOptions,
} from "./types";

export type { ReadableOptions, WritableOptions };
/**
 * Synchronously flushes all pending synchronous and asynchronous notifications.
 *
 * @category Effects & Scheduling
 */
/**
 * Runs `fn` without tracking any {@link Readable} or reactive collection reads
 * as dependencies of the current {@link computed} or {@link watch}.
 *
 * @category Utilities
 */
export { batch, flush, untrack };

/**
 * Extracts the value type from a {@link Readable}.
 *
 * @category Utilities
 */
export type ReadableValue<T> = T extends Readable<infer V> ? V : never;

/**
 * Maps a tuple or array of {@link Readable}s to their corresponding value types.
 *
 * @category Utilities
 */
export type ReadableValues<T extends readonly Readable[]> = {
  [K in keyof T]: ReadableValue<T[K]>;
};

/**
 * Returns `true` if `value` is a {@link Readable} (including {@link Writable}).
 *
 * @category Utilities
 */
export function isReadable<T>(value: Readable<T> | null | undefined): value is Readable<T>;
/**
 * Returns `true` if `value` is a {@link Readable} (including {@link Writable}).
 *
 * @category Utilities
 */
export function isReadable<T = any>(value: unknown): value is Readable<T>;
export function isReadable(value: unknown): value is Readable {
  return (value as Readable | undefined)?.[CONTRACT_SYMBOL] === CONTRACT_VERSION;
}

/**
 * Returns `true` if `value` is a {@link Writable}.
 *
 * @category Utilities
 */
export function isWritable<T>(value: Readable<T> | null | undefined): value is Writable<T>;
/**
 * Returns `true` if `value` is a {@link Writable}.
 *
 * @category Utilities
 */
export function isWritable<T = any>(value: unknown): value is Writable<T>;
export function isWritable(value: unknown): value is Writable {
  return isReadable(value) && ((value as Writable).set || NOOP_) !== NOOP_;
}

/**
 * Creates an {@link Owned} {@link Writable} reactive value initialized to `value`.
 *
 * @category Primitives
 */
export function writable<T = any>(value: T, config?: WritableOptions<T>): Owned<Writable<T>> {
  return new ValueNode(value, config);
}

/**
 * Creates a read-only reactive value and its bound {@link Setter}, returned as `[readable, set]`.
 *
 * @category Primitives
 */
export function readable<T = any>(value: T, config?: ReadableOptions<T>): [Owned<Readable<T>>, Setter<T>] {
  const v = writable(value, config);
  const result: [Owned<Readable<T>>, Setter<T>] = [v, v.set];
  v.set = NOOP_;
  return result;
}

/**
 * Computes lazily and tracks its {@link Readable} inputs. Computations and equality callbacks are
 * read-only. A detached node recomputes on its next read. Failed computations are
 * not repaired automatically; dispose and recreate the affected graph.
 *
 * @category Primitives
 */
export function computed<T>(compute: () => T, options?: ReadableOptions<T>): Owned<Readable<T>> {
  return new ComputedNode(compute, options);
}

/**
 * Creates a lazy {@link computed} node with an explicitly declared {@link Readable} dependency.
 * Pass a reactive collection's `$` readable when depending on a collection.
 *
 * @category Primitives
 */
export function derived<T, R>(
  source: Readable<T>,
  compute: (value: T) => R,
  options?: ReadableOptions<R>,
): Owned<Readable<R>>;
/**
 * Creates a lazy {@link computed} node with explicitly declared {@link Readable} dependencies.
 * Pass a reactive collection's `$` readable when depending on a collection.
 *
 * @category Primitives
 */
export function derived<const T extends readonly Readable[], R>(
  sources: T,
  compute: (...values: ReadableValues<T>) => R,
  options?: ReadableOptions<R>,
): Owned<Readable<R>>;
export function derived<R>(
  sources: Readable | readonly Readable[],
  compute: (...values: any[]) => R,
  options?: ReadableOptions<R>,
): Owned<Readable<R>> {
  let fn: () => R;
  if (isReadable(sources) || sources.length === 1) {
    const s0 = (isReadable(sources) ? sources : sources[0]!) as Source;
    fn = () => {
      const v0 = runtime.currentObserver_ !== null ? s0.get() : readSource(s0);
      runtime.currentObserver_ = null;
      return compute(v0);
    };
  } else if (sources.length === 2) {
    const s0 = sources[0]! as Source;
    const s1 = sources[1]! as Source;
    fn = () => {
      const track = runtime.currentObserver_ !== null;
      const v0 = track ? s0.get() : readSource(s0);
      const v1 = track ? s1.get() : readSource(s1);
      runtime.currentObserver_ = null;
      return compute(v0, v1);
    };
  } else {
    const deps = [...sources] as Source[];
    fn = () => {
      const track = runtime.currentObserver_ !== null;
      const values = [];
      for (let i = 0; i < deps.length; i++) {
        values.push(track ? deps[i]!.get() : readSource(deps[i]!));
      }
      runtime.currentObserver_ = null;
      return compute(...values);
    };
  }
  const node = new ComputedNode(fn, options);
  node.flags_ |= NodeFlags.DepsStatic;
  return node;
}

export type { WatchEffect };

/**
 * Scheduling options for {@link watch}.
 *
 * @category Effects & Scheduling
 */
export interface WatchOptions {
  /** Run synchronously after the current batch instead of in a microtask. Defaults to `false`. */
  sync?: boolean;
}

/**
 * Runs immediately, then in synchronous batches or asynchronous microtasks.
 * Effects check their latest inputs at their turn; reads remain live.
 * A single publication reruns the effect without comparing its input again.
 * When multiple publications occur, the effect compares the latest value with
 * its observed value and skips the callback and cleanup if its inputs are equal.
 * A thrown error aborts the current queue. Dispose affected effects and {@link computed}
 * nodes before rebuilding a failed graph.
 *
 * @category Effects & Scheduling
 */
export function watch(effect: WatchEffect, options?: WatchOptions): Cleanup {
  const node = new WatchNode(effect, options?.sync ? NodeFlags.None : NodeFlags.QueueModeAsync);
  try {
    batch(() => runEffect(node));
  } catch (error) {
    node.dispose();
    throw error;
  }
  return node.dispose;
}

/**
 * Options for {@link until}.
 *
 * @category Effects & Scheduling
 */
export interface UntilOptions extends WatchOptions {
  /** Optional `AbortSignal` to cancel waiting and reject with `signal.reason`. */
  signal?: AbortSignal;
}

/**
 * Waits until `predicate()` returns a truthy value and resolves with that value.
 * Tracks reactive reads inside `predicate` via {@link watch}.
 *
 * Pass a source's bound {@link Readable.get | get} method directly to wait for
 * a single source to become truthy.
 *
 * @example
 * ```ts
 * const user = writable<User | null>(null);
 * const loaded = await until(user.get);
 *
 * const controller = new AbortController();
 * await until(() => count.value >= 3, { signal: controller.signal });
 * ```
 *
 * @category Effects & Scheduling
 */
export function until<T>(
  predicate: () => T,
  options?: UntilOptions,
): Promise<Exclude<T, false | 0 | 0n | "" | null | undefined>> {
  return new Promise((resolve, reject) => {
    const signal = options?.signal;
    if (signal?.aborted) {
      return reject(signal.reason);
    }

    let stop: Cleanup | undefined;
    const onAbort = () => {
      stop?.();
      reject(signal!.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    stop = watch(function () {
      try {
        const value = predicate();
        if (!value) {
          return;
        }
        resolve(value as Exclude<T, false | 0 | 0n | "" | null | undefined>);
      } catch (error) {
        reject(error);
      }
      signal?.removeEventListener("abort", onAbort);
      this.dispose();
    }, options);

    if (signal?.aborted) {
      stop();
    }
  });
}
