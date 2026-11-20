import { CONTRACT_SYMBOL, CONTRACT_VERSION, Flags } from "./constants";
import {
  batch,
  ComputedNode,
  createLink,
  runEffect,
  type Source,
  ValueNode,
  type ValueOptions,
  WatchNode,
} from "./node";
import { NOOP_ } from "./runtime";

import type { Cleanup, Owned, Readable, Setter, WatchEffect, Writable } from "./types";

export { batch };

export type WritableOptions<T> = ValueOptions<T>;
export type ReadableOptions<T> = ValueOptions<T>;

export type ReadableValue<T> = T extends Readable<infer V> ? V : never;
export type ReadableValues<T extends readonly Readable[]> = {
  [K in keyof T]: ReadableValue<T[K]>;
};

export function isReadable<T>(value: Readable<T> | null | undefined): value is Readable<T>;
export function isReadable<T = any>(value: unknown): value is Readable<T>;
export function isReadable(value: unknown): value is Readable {
  return (value as Readable | undefined)?.[CONTRACT_SYMBOL] === CONTRACT_VERSION;
}

export function isWritable<T>(value: Readable<T> | null | undefined): value is Writable<T>;
export function isWritable<T = any>(value: unknown): value is Writable<T>;
export function isWritable(value: unknown): value is Writable {
  return isReadable(value) && ((value as Writable).set || NOOP_) !== NOOP_;
}

export function writable<T = any>(value: T, config?: WritableOptions<T>): Owned<Writable<T>> {
  return new ValueNode(value, config);
}

export function readable<T = any>(value: T, config?: ReadableOptions<T>): [Owned<Readable<T>>, Setter<T>] {
  const v = writable(value, config);
  const result: [Owned<Readable<T>>, Setter<T>] = [v, v.set];
  v.set = NOOP_;
  return result;
}

/**
 * Computes lazily and tracks its inputs. Computations and equality callbacks are
 * read-only. A detached node recomputes on its next read. Failed computations are
 * not repaired automatically; dispose and recreate the affected graph.
 */
export function computed<T>(compute: () => T, options?: ReadableOptions<T>): Owned<Readable<T>> {
  return new ComputedNode(compute, options);
}

/**
 * Creates a lazy computed node with explicitly declared Readable dependencies.
 * Unwrap providers with `provider.$` before passing them as dependencies.
 */
export function derived<T, R>(
  source: Readable<T>,
  compute: (value: T) => R,
  options?: ReadableOptions<R>,
): Owned<Readable<R>>;
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
  const computed = new ComputedNode(compute, options);
  computed.flags_ |= Flags.DepsStatic;
  if (isReadable(sources)) {
    computed.depHead_ = computed.depTail_ = createLink(sources as Source, computed);
  } else {
    for (const source of sources) {
      const link = createLink(source as Source, computed);
      if (computed.depTail_ !== null) {
        computed.depTail_.depNext_ = link;
      } else {
        computed.depHead_ = link;
      }
      computed.depTail_ = link;
    }
  }
  return computed;
}

export type { WatchEffect };

export interface WatchOptions {
  sync?: boolean;
}

/**
 * Runs immediately, then in synchronous batches or asynchronous microtasks.
 * Effects check their latest inputs at their turn; reads remain live.
 * A single publication reruns the effect without comparing its input again.
 * When multiple publications occur, the effect compares the latest value with
 * its observed value and skips the callback and cleanup if its inputs are equal.
 * A thrown error aborts the current queue. Dispose affected effects and computed
 * nodes before rebuilding a failed graph.
 */
export function watch(effect: WatchEffect, options?: WatchOptions): Cleanup {
  const node = new WatchNode(effect, options?.sync ? Flags.None : Flags.QueueModeAsync);
  try {
    batch(() => runEffect(node));
  } catch (error) {
    node.dispose();
    throw error;
  }
  return node.dispose;
}
