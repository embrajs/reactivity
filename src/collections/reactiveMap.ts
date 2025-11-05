import { batchFlush, batchStart, type BatchTask, batchTasks } from "../batch";
import { type EventObject, on, type RemoveListener, send, size } from "../event";
import { writable } from "../readable";
import { type ReadableProvider, type OwnedWritable, type Readable } from "../typings";
import { strictEqual } from "../utils";
import { onDisposeValue, type OnDisposeValue } from "./utils";

export interface ReactiveMapChanged<K, V> {
  readonly upsert: readonly [K, V][];
  readonly delete: readonly K[];
}

interface OnChanged<K, V> extends BatchTask<EventObject<ReactiveMapChanged<K, V>>> {
  readonly upsert_: Map<K, V>;
  readonly delete_: Set<K>;
}

export class OwnedReactiveMap<K, V> extends Map<K, V> implements ReadableProvider<ReadonlyReactiveMap<K, V>> {
  /**
   * A Readable that emits the map itself whenever it changes.
   */
  public get $(): Readable<ReadonlyReactiveMap<K, V>> {
    return (this._$ ??= writable(this, { equal: false }));
  }

  /**
   * Subscribe to changes in the map.
   *
   * @param fn - The function to call when the map is changed.
   * @returns A disposer function to unsubscribe from the event.
   */
  public onChanged(fn: (changed: ReactiveMapChanged<K, V>) => void): RemoveListener {
    return on(
      (this._onChanged_ ??= {
        delete_: new Set<K>(),
        upsert_: new Map<K, V>(),
        batchTask_: () => {
          if (this._onChanged_ && size(this._onChanged_)) {
            const { upsert_, delete_ } = this._onChanged_;
            if (upsert_.size > 0 || delete_.size > 0) {
              const changedData = {
                upsert: [...upsert_],
                delete: [...delete_],
              };
              upsert_.clear();
              delete_.clear();
              send(this._onChanged_, changedData);
            }
          } else {
            this._onChanged_ = null;
          }
        },
      }),
      fn,
    );
  }

  /**
   * Subscribe to events when a value is needed to be disposed.
   *
   * A value is considered for disposal when:
   * - it is deleted from the map.
   * - it is replaced by another value (the old value is removed).
   * - it is cleared from the map.
   * - the map is disposed.
   *
   * Note that for performance reasons, it does not handle the case where multiple keys map to the same value.
   *
   * @param fn - The function to call when a value is needed to be disposed.
   * @returns A disposer function to unsubscribe from the event.
   */
  public readonly onDisposeValue = onDisposeValue;

  public constructor(entries?: Iterable<readonly [K, V]> | null) {
    super();

    if (entries) {
      for (const [key, value] of entries) {
        super.set(key, value);
      }
    }
  }

  public dispose(): void {
    if (this._disposed_) return;
    if (process.env.NODE_ENV !== "production") {
      this._disposed_ = new Error("[embra] ReactiveMap disposed at:");
    } else {
      this._disposed_ = true;
    }
    if (this.onDisposeValue_) {
      const { delete_ } = this.onDisposeValue_;
      for (const value of this.values()) {
        delete_.add(value);
      }
      if (delete_.size) {
        const isBatchTop = batchStart();
        batchTasks.add(this.onDisposeValue_);
        isBatchTop && batchFlush();
      }
    }
    this._$ = this._onChanged_ = this.onDisposeValue_ = null;
  }

  public override set(key: K, value: V): this {
    if (this.has(key)) {
      const oldValue = this.get(key)!;
      if (!strictEqual(oldValue, value)) {
        const isBatchTop = batchStart();
        // task added in this._upsert_
        this.onDisposeValue_?.delete_.add(oldValue);
        this._upsert_(key, value);
        isBatchTop && batchFlush();
      }
    } else {
      const isBatchTop = batchStart();
      this._upsert_(key, value);
      isBatchTop && batchFlush();
    }
    return this;
  }

  public override delete(key: K): boolean {
    if (this.has(key)) {
      const isBatchTop = batchStart();
      if (this.onDisposeValue_) {
        this.onDisposeValue_.delete_.add(this.get(key)!);
        batchTasks.add(this.onDisposeValue_);
      }
      if (this._onChanged_) {
        this._onChanged_.delete_.add(key);
        this._onChanged_.upsert_.delete(key);
        batchTasks.add(this._onChanged_);
      }
      this._notify_();
      isBatchTop && batchFlush();
    }
    return super.delete(key);
  }

  public override clear(): void {
    if (this.size) {
      const isBatchTop = batchStart();
      if (this.onDisposeValue_ || this._onChanged_) {
        for (const [key, value] of this) {
          if (this.onDisposeValue_) {
            this.onDisposeValue_.delete_.add(value);
            batchTasks.add(this.onDisposeValue_);
          }
          if (this._onChanged_) {
            this._onChanged_.delete_.add(key);
            this._onChanged_.upsert_.delete(key);
            batchTasks.add(this._onChanged_);
          }
        }
      }
      super.clear();
      this._notify_();
      isBatchTop && batchFlush();
    }
  }

  public rename(key: K, newKey: K): void {
    if (this.has(key)) {
      const isBatchTop = batchStart();
      const value = this.get(key)!;
      this.delete(key);
      this.set(newKey, value);
      isBatchTop && batchFlush();
    }
  }

  /** @internal */
  private _disposed_?: Error | true;

  /** @internal */
  private _$?: OwnedWritable<this> | null;

  /** @internal */
  private _onChanged_?: null | OnChanged<K, V>;

  /** @internal */
  public onDisposeValue_?: null | OnDisposeValue<V>;

  /** @internal */
  private _upsert_(key: K, value: V): void {
    this.onDisposeValue_?.delete_.delete(value);
    if (this._onChanged_) {
      this._onChanged_.upsert_.set(key, value);
      this._onChanged_.delete_.delete(key);
      batchTasks.add(this._onChanged_);
    }
    super.set(key, value);
    this._notify_();
  }

  /** @internal */
  private _notify_() {
    if (this._disposed_) {
      console.error(this, new Error("disposed"));
      if (process.env.NODE_ENV !== "production") {
        console.error(this._disposed_);
      }
    }
    this._$?.set(this);
  }
}

export type ReactiveMap<K, V> = Omit<OwnedReactiveMap<K, V>, "dispose">;

export interface ReadonlyReactiveMap<K, V> extends ReadonlyMap<K, V> {
  readonly $: Readable<ReadonlyMap<K, V>>;
  /**
   * Subscribe to changes in the map.
   *
   * @param fn - The function to call when the map is changed.
   * @returns A disposer function to unsubscribe from the event.
   */
  onChanged(fn: (changed: ReactiveMapChanged<K, V>) => void): RemoveListener;
  /**
   * Subscribe to events when a value is needed to be disposed.
   *
   * A value is considered for disposal when:
   * - it is deleted from the map.
   * - it is replaced by another value (the old value is removed).
   * - it is cleared from the map.
   * - the map is disposed.
   *
   * Note that for performance reasons, it does not handle the case where multiple keys map to the same value.
   *
   * @param fn - The function to call when a value is needed to be disposed.
   * @returns A disposer function to unsubscribe from the event.
   */
  onDisposeValue(fn: (value: V) => void): RemoveListener;
}

/**
 * @param entries - Initial entries for the reactive map.
 * @returns A new instance of {@link OwnedReactiveMap}.
 *
 * @example
 * ```ts
 * import { reactiveMap } from "@embra/reactivity";
 *
 * const map$ = reactiveMap([["key", "value"]]);
 * ```
 */
export const reactiveMap = <K, V>(entries?: Iterable<readonly [K, V]> | null): OwnedReactiveMap<K, V> =>
  new OwnedReactiveMap(entries);
