import { batch, type BatchTask, tasks, toTask } from "../batch";
import { type AddEventListener, event, send, size } from "../event";
import { writable } from "../readable";
import { type Disposer, type OwnedWritable, type Readable } from "../typings";
import { strictEqual } from "../utils";

export interface ReactiveMapChanged<K, V> {
  readonly upsert: readonly [K, V][];
  readonly delete: readonly K[];
}

export class OwnedReactiveMap<K, V> extends Map<K, V> {
  /**
   * A Readable that emits the map itself whenever it changes.
   */
  public get $(): Readable<ReactiveMap<K, V>> {
    return (this._$ ??= writable(this, { equal: false }));
  }

  /**
   * Subscribe to changes in the map.
   *
   * @param fn - The function to call when the map is changed.
   * @returns A disposer function to unsubscribe from the event.
   */
  public onChanged(fn: (changed: ReactiveMapChanged<K, V>) => void): Disposer {
    return (this._onChanged_ ??= toTask(event({ delete: new Set(), upsert: new Map() }), () => {
      if (this._onChanged_ && size(this._onChanged_)) {
        const { data_ } = this._onChanged_;
        if (data_.upsert.size > 0 || data_.delete.size > 0) {
          const changedData = {
            upsert: [...data_.upsert],
            delete: [...data_.delete],
          };
          data_.upsert.clear();
          data_.delete.clear();
          send(this._onChanged_, changedData);
        }
      } else {
        this._onChanged_ = undefined;
      }
    }))(fn);
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
  public onDisposeValue(fn: (value: V) => void): Disposer {
    return (this._onDisposeValue_ ??= toTask(event(new Set<V>()), () => {
      if (this._onDisposeValue_ && size(this._onDisposeValue_)) {
        const { data_ } = this._onDisposeValue_;
        if (data_.size) {
          const removedValues = [...data_];
          data_.clear();
          for (const value of removedValues) {
            send(this._onDisposeValue_, value);
          }
        }
      } else {
        this._onDisposeValue_ = undefined;
      }
    }))(fn);
  }

  public constructor(entries?: readonly (readonly [K, V])[] | null) {
    super();

    if (entries) {
      batch(() => {
        for (const [key, value] of entries) {
          this.set(key, value);
        }
      });
    }
  }

  public dispose(): void {
    if (this._disposed_) return;
    if (process.env.NODE_ENV !== "production") {
      this._disposed_ = new Error("[embra] ReactiveMap disposed at:");
    } else {
      this._disposed_ = true;
    }
    if (this._onDisposeValue_) {
      const { data_ } = this._onDisposeValue_;
      for (const value of this.values()) {
        data_.add(value);
      }
      if (data_.size) {
        batch(() => {
          tasks.add(this._onDisposeValue_!);
        });
      }
    }
    this._$ = this._onChanged_ = this._onDisposeValue_ = undefined;
  }

  public override set(key: K, value: V): this {
    if (this.has(key)) {
      const oldValue = this.get(key)!;
      if (!strictEqual(oldValue, value)) {
        // task added in this._upsert_
        this._onDisposeValue_?.data_.add(oldValue);
        this._upsert_(key, value);
      }
    } else {
      this._upsert_(key, value);
    }
    return this;
  }

  public override delete(key: K): boolean {
    if (this.has(key)) {
      if (this._onDisposeValue_) {
        this._onDisposeValue_.data_.add(this.get(key)!);
        tasks.add(this._onDisposeValue_);
      }
      if (this._onChanged_) {
        this._onChanged_.data_.delete.add(key);
        this._onChanged_.data_.upsert.delete(key);
        tasks.add(this._onChanged_);
      }
      this._notify_();
    }
    return super.delete(key);
  }

  public override clear(): void {
    if (this.size) {
      if (this._onDisposeValue_ || this._onChanged_) {
        for (const [key, value] of this) {
          if (this._onDisposeValue_) {
            this._onDisposeValue_.data_.add(value);
            tasks.add(this._onDisposeValue_);
          }
          if (this._onChanged_) {
            this._onChanged_.data_.delete.add(key);
            this._onChanged_.data_.upsert.delete(key);
            tasks.add(this._onChanged_);
          }
        }
      }
      super.clear();
      this._notify_();
    }
  }

  public rename(key: K, newKey: K): void {
    batch(() => {
      if (this.has(key)) {
        const value = this.get(key)!;
        this.delete(key);
        this.set(newKey, value);
      }
    });
  }

  /**
   * @internal
   */
  private _disposed_?: Error | true;

  /** @internal */
  private _$?: OwnedWritable<this>;

  /** @internal */
  private _onChanged_?: BatchTask<
    AddEventListener<
      ReactiveMapChanged<K, V>,
      {
        readonly upsert: Map<K, V>;
        readonly delete: Set<K>;
      }
    >
  >;

  /** @internal */
  private _onDisposeValue_?: BatchTask<AddEventListener<V, Set<V>>>;

  /** @internal */
  private _upsert_(key: K, value: V): void {
    if (this._onDisposeValue_) {
      this._onDisposeValue_.data_.delete(value);
      tasks.add(this._onDisposeValue_);
    }
    if (this._onChanged_) {
      this._onChanged_.data_.upsert.set(key, value);
      this._onChanged_.data_.delete.delete(key);
      tasks.add(this._onChanged_);
    }
    super.set(key, value);
    this._notify_();
  }

  /** @internal */
  private _notify_() {
    if (this._disposed_) {
      console.error(new Error("disposed"));
      if (process.env.NODE_ENV !== "production") {
        console.error(this._disposed_);
      }
    }
    this._$?.set(this);
  }
}

export type ReactiveMap<K, V> = Omit<OwnedReactiveMap<K, V>, "dispose">;

export const reactiveMap = <K, V>(entries?: readonly (readonly [K, V])[] | null): OwnedReactiveMap<K, V> =>
  new OwnedReactiveMap(entries);
