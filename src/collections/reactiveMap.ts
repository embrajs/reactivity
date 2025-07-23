import { batch } from "../batch";
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
    if (!this._onChanged_) {
      this._onChanged_ = event({ delete: new Set(), upsert: new Map() });
      const handler = () => {
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
          this.$.unsubscribe(handler);
        }
      };
      this.$.onReaction_(handler);
    }
    return this._onChanged_(fn);
  }

  /**
   * Subscribe to value removal events.
   * This is useful for further processing values that are removed from the map.
   *
   * A value is considered removed when:
   * - it is deleted from the map.
   * - it is replaced by another value (the old value is removed).
   * - it is cleared from the map.
   *
   * Note that for performance reasons, it does not handle the case where multiple keys map to the same value.
   *
   * @param fn - The function to call when a value is removed.
   * @returns A disposer function to unsubscribe from the event.
   */
  public onValueRemoved(fn: (value: V) => void): Disposer {
    if (!this._onValueRemoved_) {
      this._onValueRemoved_ = event(new Set<V>());
      const handler = () => {
        if (this._onValueRemoved_ && size(this._onValueRemoved_)) {
          const { data_ } = this._onValueRemoved_;
          if (data_.size) {
            const removedValues = [...data_];
            data_.clear();
            for (const value of removedValues) {
              send(this._onValueRemoved_, value);
            }
          }
        } else {
          this._onValueRemoved_ = undefined;
          this.$.unsubscribe(handler);
        }
      };
      this.$.onReaction_(handler);
    }
    return this._onValueRemoved_(fn);
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
    this._$?.dispose();
    this._onChanged_ = this._onValueRemoved_ = undefined;
    super.clear();
  }

  public override set(key: K, value: V): this {
    if (this.has(key)) {
      const oldValue = this.get(key)!;
      if (!strictEqual(oldValue, value)) {
        this._onValueRemoved_?.data_.add(oldValue);
        this._upsert_(key, value);
      }
    } else {
      this._upsert_(key, value);
    }
    return this;
  }

  public override delete(key: K): boolean {
    if (this.has(key)) {
      this._onValueRemoved_?.data_.add(this.get(key)!);
      this._onChanged_?.data_.delete.add(key);
      this._onChanged_?.data_.upsert.delete(key);
      this._$?.set(this);
    }
    return super.delete(key);
  }

  public override clear(): void {
    if (this.size) {
      if (this._onValueRemoved_ || this._onChanged_) {
        for (const [key, value] of this) {
          this._onValueRemoved_?.data_.add(value);
          this._onChanged_?.data_.delete.add(key);
          this._onChanged_?.data_.upsert.delete(key);
        }
      }
      super.clear();
      this._$?.set(this);
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

  /** @internal */
  private _$?: OwnedWritable<this>;

  /** @internal */
  private _onChanged_?: AddEventListener<
    ReactiveMapChanged<K, V>,
    {
      readonly upsert: Map<K, V>;
      readonly delete: Set<K>;
    }
  >;

  /** @internal */
  private _onValueRemoved_?: AddEventListener<V, Set<V>>;

  /** @internal */
  private _upsert_(key: K, value: V): void {
    this._onValueRemoved_?.data_.delete(value);
    this._onChanged_?.data_.upsert.set(key, value);
    this._onChanged_?.data_.delete.delete(key);
    super.set(key, value);
    this._$?.set(this);
  }
}

export type ReactiveMap<K, V> = Omit<OwnedReactiveMap<K, V>, "dispose">;

export const reactiveMap = <K, V>(entries?: readonly (readonly [K, V])[] | null): OwnedReactiveMap<K, V> =>
  new OwnedReactiveMap(entries);
