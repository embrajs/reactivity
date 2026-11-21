import { Flags } from "../constants";
import { batch } from "../reactivity";
import type { Cleanup, Owned, Readable, Writable } from "../types";
import {
  type BatchChannel,
  cancelDisposal,
  cancelDisposals,
  checkCollectionWrite,
  createCollectionSource,
  disposeCollection,
  hasChannelListeners,
  notifyCollection,
  queueAllChannel,
  queueChannel,
  type ReactiveCollection,
  subscribeCollection,
  trackCollection,
} from "./utils";

/**
 * ReadonlyReactiveMap is a readonly interface for {@link ReactiveMap}.
 *
 * @category ReactiveMap
 */
export interface ReadonlyReactiveMap<K, V> extends ReadonlyMap<K, V> {
  /**
   * A Readable that emits the Map itself whenever it changes.
   *
   * @group Readable
   */
  readonly $: Readable<ReadonlyReactiveMap<K, V>>;
  /**
   * Subscribe synchronously to dirty keys modified in the current batch.
   * Callbacks must not mutate the source map itself.
   *
   * @group Events
   */
  onChanged(fn: (keys: readonly K[]) => void): Cleanup;
  /**
   * Subscribe synchronously to values removed, overwritten, cleared, or disposed.
   * Callbacks must not mutate the source map itself.
   *
   * @group Events
   */
  onDisposeValue(fn: (value: V) => void): Cleanup;
}

/**
 * Extends the standard Map interface with reactive tracking and value ownership.
 * Reads inside `computed` or `watch` automatically track `$`.
 *
 * @category ReactiveMap
 */
export interface ReactiveMap<K, V> extends Map<K, V> {
  /**
   * A Readable that emits the Map itself whenever it changes.
   *
   * @group Readable
   */
  readonly $: Readable<ReadonlyReactiveMap<K, V>>;
  /**
   * Subscribe synchronously to dirty keys modified in the current batch.
   * Callbacks must not mutate the source map itself.
   *
   * @group Events
   */
  onChanged(fn: (keys: readonly K[]) => void): Cleanup;
  /**
   * Subscribe synchronously to values removed, overwritten, cleared, or disposed.
   * Callbacks must not mutate the source map itself.
   *
   * @group Events
   */
  onDisposeValue(fn: (value: V) => void): Cleanup;
  rename(key: K, newKey: K): void;
  replace(entries: Iterable<readonly [K, V]>): this;
}

class ReactiveMapImpl<K, V> extends Map<K, V> implements ReactiveMap<K, V>, ReactiveCollection {
  public flags_: Flags;
  public source_: Owned<Writable<any>> | null;
  public cleanup_: BatchChannel<V> | null;
  public changed_: BatchChannel<K> | null;
  public __dev_disposed_at?: Error;

  public constructor(entries?: Iterable<readonly [K, V]> | null) {
    super();
    this.flags_ = Flags.None;
    this.source_ = null;
    this.cleanup_ = null;
    this.changed_ = null;
    if (entries) {
      for (const [key, value] of entries) {
        super.set(key, value);
      }
    }
  }

  public get $(): Readable<ReadonlyReactiveMap<K, V>> {
    return (this.source_ ??= createCollectionSource(this));
  }

  public onChanged(fn: (keys: readonly K[]) => void): Cleanup {
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

  public override get(key: K): V | undefined {
    trackCollection(this);
    return super.get(key);
  }

  public override has(key: K): boolean {
    trackCollection(this);
    return super.has(key);
  }

  public override keys(): MapIterator<K> {
    trackCollection(this);
    return super.keys();
  }

  public override values(): MapIterator<V> {
    trackCollection(this);
    return super.values();
  }

  public override entries(): MapIterator<[K, V]> {
    trackCollection(this);
    return super.entries();
  }

  public override [Symbol.iterator](): MapIterator<[K, V]> {
    trackCollection(this);
    return super[Symbol.iterator]();
  }

  public override forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
    trackCollection(this);
    super.forEach(callbackfn, thisArg);
  }

  public override set(key: K, value: V): this {
    if (process.env.NODE_ENV !== "production") {
      checkCollectionWrite(this);
    }
    const oldValue = super.get(key);
    if (oldValue !== undefined || super.has(key)) {
      if (oldValue === value) {
        return this;
      }
      queueChannel(this.cleanup_, oldValue!);
    }
    super.set(key, value);
    cancelDisposal(this.cleanup_, value);
    queueChannel(this.changed_, key);
    notifyCollection(this);
    return this;
  }

  public override delete(key: K): boolean {
    if (process.env.NODE_ENV !== "production") {
      checkCollectionWrite(this);
    }
    const oldValue = hasChannelListeners(this.cleanup_) ? super.get(key) : undefined;
    if (super.delete(key)) {
      queueChannel(this.cleanup_, oldValue!);
      queueChannel(this.changed_, key);
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
      queueAllChannel(this.changed_, super.keys());
      super.clear();
      notifyCollection(this);
    }
  }

  public rename(key: K, newKey: K): void {
    if (process.env.NODE_ENV !== "production") {
      checkCollectionWrite(this);
    }
    if (key !== newKey && super.has(key)) {
      batch(() => {
        const value = super.get(key)!;
        this.delete(key);
        this.set(newKey, value);
        cancelDisposal(this.cleanup_, value);
      });
    }
  }

  public replace(entries: Iterable<readonly [K, V]>): this {
    if (process.env.NODE_ENV !== "production") {
      checkCollectionWrite(this);
    }
    batch(() => {
      const keys = super.size > 0 ? ([] as K[]) : null;
      for (const [key, value] of entries) {
        keys?.push(key);
        this.set(key, value);
      }
      if (keys !== null) {
        let index = 0;
        for (const key of super.keys()) {
          if (keys[index] === key) {
            index++;
          } else if (!keys.includes(key)) {
            this.delete(key);
          }
        }
      }
      cancelDisposals(this.cleanup_, super.values());
    });
    return this;
  }
}

/**
 * Creates a new {@link OwnedReactiveMap}.
 *
 * @category ReactiveMap
 */
export function reactiveMap<K, V>(entries?: Iterable<readonly [K, V]> | null): Owned<ReactiveMap<K, V>> {
  return new ReactiveMapImpl(entries);
}
