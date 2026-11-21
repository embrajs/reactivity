import { Flags } from "../constants";
import { batch } from "../reactivity";
import type { Cleanup, Owned, Readable, Writable } from "../types";
import {
  type BatchChannel,
  cancelDisposal,
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
 * ReadonlyReactiveSet is a readonly interface for {@link ReactiveSet}.
 *
 * @category ReactiveSet
 */
export interface ReadonlyReactiveSet<V> extends ReadonlySet<V> {
  /**
   * A Readable that emits the Set itself whenever it changes.
   *
   * @group Readable
   */
  readonly $: Readable<ReadonlyReactiveSet<V>>;
  /**
   * Subscribe synchronously to values added or deleted in the current batch.
   * Callbacks must not mutate the source set itself.
   *
   * @group Events
   */
  onChanged(fn: (values: readonly V[]) => void): Cleanup;
  /**
   * Subscribe synchronously to values deleted, cleared, or disposed.
   * Callbacks must not mutate the source set itself.
   *
   * @group Events
   */
  onDisposeValue(fn: (value: V) => void): Cleanup;
}

/**
 * Extends the standard Set interface with reactive tracking and value ownership.
 * Reads inside `computed` or `watch` automatically track `$`.
 *
 * @category ReactiveSet
 */
export interface ReactiveSet<V> extends Set<V> {
  /**
   * A Readable that emits the Set itself whenever it changes.
   *
   * @group Readable
   */
  readonly $: Readable<ReadonlyReactiveSet<V>>;
  /**
   * Subscribe synchronously to values added or deleted in the current batch.
   * Callbacks must not mutate the source set itself.
   *
   * @group Events
   */
  onChanged(fn: (values: readonly V[]) => void): Cleanup;
  /**
   * Subscribe synchronously to values deleted, cleared, or disposed.
   * Callbacks must not mutate the source set itself.
   *
   * @group Events
   */
  onDisposeValue(fn: (value: V) => void): Cleanup;
  replace(values: Iterable<V>): this;
}

class ReactiveSetImpl<V> extends Set<V> implements ReactiveSet<V>, ReactiveCollection {
  public flags_: Flags;
  public source_: Owned<Writable<any>> | null;
  public cleanup_: BatchChannel<V> | null;
  public changed_: BatchChannel<V> | null;
  public __dev_disposed_at?: Error;

  public constructor(values?: Iterable<V> | null) {
    super();
    this.flags_ = Flags.None;
    this.source_ = null;
    this.cleanup_ = null;
    this.changed_ = null;
    if (values) {
      for (const value of values) {
        super.add(value);
      }
    }
  }

  public get $(): Readable<ReadonlyReactiveSet<V>> {
    return (this.source_ ??= createCollectionSource(this));
  }

  public onChanged(fn: (values: readonly V[]) => void): Cleanup {
    return subscribeCollection(this, Flags.None, fn);
  }

  public onDisposeValue(fn: (value: V) => void): Cleanup {
    return subscribeCollection(this, Flags.Pending, fn);
  }

  public dispose(): void {
    disposeCollection(this, super.values());
  }

  public override get size(): number {
    trackCollection(this);
    return super.size;
  }

  public override has(value: V): boolean {
    trackCollection(this);
    return super.has(value);
  }

  public override keys(): SetIterator<V> {
    trackCollection(this);
    return super.keys();
  }

  public override values(): SetIterator<V> {
    trackCollection(this);
    return super.values();
  }

  public override entries(): SetIterator<[V, V]> {
    trackCollection(this);
    return super.entries();
  }

  public override [Symbol.iterator](): SetIterator<V> {
    trackCollection(this);
    return super[Symbol.iterator]();
  }

  public override forEach(callbackfn: (value: V, value2: V, set: Set<V>) => void, thisArg?: any): void {
    trackCollection(this);
    super.forEach(callbackfn, thisArg);
  }

  public override add(value: V): this {
    if (process.env.NODE_ENV !== "production") {
      checkCollectionWrite(this);
    }
    if (!super.has(value)) {
      super.add(value);
      cancelDisposal(this.cleanup_, value);
      queueChannel(this.changed_, value);
      notifyCollection(this);
    }
    return this;
  }

  public override delete(value: V): boolean {
    if (process.env.NODE_ENV !== "production") {
      checkCollectionWrite(this);
    }
    if (super.delete(value)) {
      queueChannel(this.cleanup_, value);
      queueChannel(this.changed_, value);
      notifyCollection(this);
      return true;
    }
    return false;
  }

  public override clear(): void {
    if (process.env.NODE_ENV !== "production") {
      checkCollectionWrite(this);
    }
    if (super.size > 0) {
      queueAllChannel(this.cleanup_, super.values());
      queueAllChannel(this.changed_, super.values());
      super.clear();
      notifyCollection(this);
    }
  }

  public replace(values: Iterable<V>): this {
    if (process.env.NODE_ENV !== "production") {
      checkCollectionWrite(this);
    }
    batch(() => {
      const list = super.size > 0 ? ([] as V[]) : null;
      for (const value of values) {
        list?.push(value);
        this.add(value);
      }
      if (list !== null) {
        let index = 0;
        for (const value of super.values()) {
          if (list[index] === value) {
            index++;
          } else if (!list.includes(value)) {
            this.delete(value);
          }
        }
      }
    });
    return this;
  }
}

/**
 * Creates a new {@link OwnedReactiveSet}.
 *
 * @category ReactiveSet
 */
export function reactiveSet<V>(values?: Iterable<V> | null): Owned<ReactiveSet<V>> {
  return new ReactiveSetImpl(values);
}
