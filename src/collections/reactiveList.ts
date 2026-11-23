import { Flags } from "../constants";
import type { Cleanup, Owned, Readable, Writable } from "../types";
import {
  type BatchChannel,
  cancelDisposal,
  cancelDisposals,
  checkCollectionWrite,
  createCollectionSource,
  disposeCollection,
  notifyCollection,
  queueAllChannel,
  queueChannel,
  type ReactiveCollection,
  subscribeCollection,
  trackCollection,
} from "./utils";

/**
 * ReadonlyReactiveList is a readonly interface for {@link ReactiveList}.
 *
 * @category ReactiveList
 */
export interface ReadonlyReactiveList<V> extends Iterable<V> {
  /**
   * A {@link Readable} that emits the ReactiveList itself whenever it changes.
   *
   * @group Readable
   */
  readonly $: Readable<ReadonlyReactiveList<V>>;
  /** Number of elements in the list. */
  readonly length: number;
  /** Returns the element at `index`, or `undefined` if out of bounds. */
  get(index: number): V | undefined;
  /** The backing array as a read-only view. Do not mutate it. */
  readonly array: readonly V[];
  /** Returns the JSON representation of the list. */
  toJSON(): readonly V[];
  /**
   * Subscribe synchronously to values removed, overwritten, cleared, or disposed.
   * Callbacks must not mutate the source list itself.
   *
   * @group Events
   */
  onDisposeValue(fn: (value: V) => void): Cleanup;
}

/**
 * A reactive list backed by a plain array. It does not extend Array: indexed
 * access is replaced by `get(i)` so that reads inside `computed` or `watch`
 * are always tracked. Use `array` for other read-only array operations.
 *
 * Ownership tracks values by identity. Removing one of several identical
 * entries reports the value as disposed.
 *
 * @category ReactiveList
 */
export interface ReactiveList<V> extends ReadonlyReactiveList<V> {
  /** Overwrites the value at an existing index. */
  set(index: number, value: V): void;
  /** Appends items to the end of the list and returns the new length. */
  push(...items: V[]): number;
  /** Removes and returns the last item, or `undefined` if empty. */
  pop(): V | undefined;
  /** Removes and returns the first item, or `undefined` if empty. */
  shift(): V | undefined;
  /** Prepends items to the start of the list and returns the new length. */
  unshift(...items: V[]): number;
  /** Same as `Array.prototype.splice`, except an `undefined` deleteCount removes to the end. */
  splice(start: number, deleteCount?: number, ...items: V[]): V[];
  /** Removes all items from the list. */
  clear(): void;
  /** Replaces all items. Values kept in the new contents are not disposed. */
  replace(items: Iterable<V>): void;
  /** Sorts the list in place using an optional comparator. */
  sort(compareFn?: (a: V, b: V) => number): void;
  /** Reverses the list in place. */
  reverse(): void;
}

class ReactiveListImpl<V> implements ReactiveList<V>, ReactiveCollection {
  public flags_: Flags;
  public source_: Owned<Writable<any>> | null;
  public cleanup_: BatchChannel<V> | null;
  public items_: V[];
  public __dev_disposed_at?: Error;

  public constructor(values?: Iterable<V> | null) {
    this.flags_ = Flags.None;
    this.source_ = null;
    this.cleanup_ = null;
    this.items_ = values ? [...values] : [];
  }

  public get $(): Readable<ReadonlyReactiveList<V>> {
    return (this.source_ ??= createCollectionSource(this));
  }

  public onDisposeValue(fn: (value: V) => void): Cleanup {
    return subscribeCollection(this, Flags.Pending, fn);
  }

  public dispose(): void {
    disposeCollection(this, this.items_);
  }

  public [Symbol.dispose](): void {
    this.dispose();
  }

  public get length(): number {
    trackCollection(this);
    return this.items_.length;
  }

  public get(index: number): V | undefined {
    trackCollection(this);
    return this.items_[index];
  }

  public get array(): readonly V[] {
    trackCollection(this);
    return this.items_;
  }

  public toJSON(): readonly V[] {
    trackCollection(this);
    return this.items_;
  }

  public [Symbol.iterator](): ArrayIterator<V> {
    trackCollection(this);
    return this.items_[Symbol.iterator]();
  }

  public set(index: number, value: V): void {
    if (__DEV__) {
      checkCollectionWrite(this);
    }
    if (index >= 0 && index < this.items_.length) {
      const oldValue = this.items_[index];
      if (oldValue !== value) {
        this.items_[index] = value;
        queueChannel(this.cleanup_, oldValue);
        cancelDisposal(this.cleanup_, value);
        notifyCollection(this);
      }
    }
  }

  public push(...items: V[]): number {
    if (__DEV__) {
      checkCollectionWrite(this);
    }
    const length = this.items_.push(...items);
    if (items.length > 0) {
      cancelDisposals(this.cleanup_, items);
      notifyCollection(this);
    }
    return length;
  }

  public pop(): V | undefined {
    if (__DEV__) {
      checkCollectionWrite(this);
    }
    if (this.items_.length > 0) {
      const value = this.items_.pop()!;
      queueChannel(this.cleanup_, value);
      notifyCollection(this);
      return value;
    }
  }

  public shift(): V | undefined {
    if (__DEV__) {
      checkCollectionWrite(this);
    }
    if (this.items_.length > 0) {
      const value = this.items_.shift()!;
      queueChannel(this.cleanup_, value);
      notifyCollection(this);
      return value;
    }
  }

  public unshift(...items: V[]): number {
    if (__DEV__) {
      checkCollectionWrite(this);
    }
    const length = this.items_.unshift(...items);
    if (items.length > 0) {
      cancelDisposals(this.cleanup_, items);
      notifyCollection(this);
    }
    return length;
  }

  public splice(start: number, deleteCount?: number, ...items: V[]): V[] {
    if (__DEV__) {
      checkCollectionWrite(this);
    }
    const removed = this.items_.splice(start, deleteCount ?? this.items_.length, ...items);
    if (removed.length > 0 || items.length > 0) {
      queueAllChannel(this.cleanup_, removed);
      cancelDisposals(this.cleanup_, items);
      notifyCollection(this);
    }
    return removed;
  }

  public clear(): void {
    this.splice(0);
  }

  public replace(items: Iterable<V>): void {
    if (__DEV__) {
      checkCollectionWrite(this);
    }
    const prev = this.items_;
    const next = [...items];
    if (prev.length !== next.length || prev.some((item, i) => item !== next[i])) {
      this.items_ = next;
      queueAllChannel(this.cleanup_, prev);
      cancelDisposals(this.cleanup_, next);
      notifyCollection(this);
    }
  }

  public sort(compareFn?: (a: V, b: V) => number): void {
    if (__DEV__) {
      checkCollectionWrite(this);
    }
    if (this.items_.length > 1) {
      this.items_.sort(compareFn);
      notifyCollection(this);
    }
  }

  public reverse(): void {
    if (__DEV__) {
      checkCollectionWrite(this);
    }
    if (this.items_.length > 1) {
      this.items_.reverse();
      notifyCollection(this);
    }
  }
}

/**
 * Creates a new {@link Owned} {@link ReactiveList}.
 *
 * @category ReactiveList
 */
export function reactiveList<V>(values?: Iterable<V> | null): Owned<ReactiveList<V>> {
  return new ReactiveListImpl(values);
}
