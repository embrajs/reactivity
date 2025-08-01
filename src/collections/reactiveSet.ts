import { batchFlush, batchStart, type BatchTask, tasks } from "../batch";
import { type EventObject, on, type OnDisposeValue, type RemoveListener, send, size } from "../event";
import { writable } from "../readable";
import { type OwnedWritable, type Readable } from "../typings";

export interface ReactiveSetChanged<V> {
  readonly upsert: readonly V[];
  readonly delete: readonly V[];
}

interface OnChanged<V> extends BatchTask<EventObject<ReactiveSetChanged<V>>> {
  readonly upsert_: Set<V>;
  readonly delete_: Set<V>;
}

export class OwnedReactiveSet<V> extends Set<V> {
  /**
   * A Readable that emits the set itself whenever it changes.
   */
  public get $(): Readable<ReactiveSet<V>> {
    return (this._$ ??= writable(this, { equal: false }));
  }

  /**
   * Subscribe to changes in the set.
   *
   * @param fn - The function to call when the set is changed.
   * @returns A disposer function to unsubscribe from the event.
   */
  public onChanged(fn: (changed: ReactiveSetChanged<V>) => void): RemoveListener {
    return on(
      (this._onChanged_ ??= {
        delete_: new Set<V>(),
        upsert_: new Set<V>(),
        task_: () => {
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
   * - it is deleted from the set.
   * - it is replaced by another value (the old value is removed).
   * - it is cleared from the set.
   * - the set is disposed.
   *
   * @param fn - The function to call when a value is needed to be disposed.
   * @returns A disposer function to unsubscribe from the event.
   */
  public onDisposeValue(fn: (value: V) => void): RemoveListener {
    return on(
      (this._onDisposeValue_ ??= {
        delete_: new Set<V>(),
        task_: () => {
          if (this._onDisposeValue_ && size(this._onDisposeValue_)) {
            const { delete_ } = this._onDisposeValue_;
            if (delete_.size) {
              const removedValues = [...delete_];
              delete_.clear();
              for (const value of removedValues) {
                send(this._onDisposeValue_, value);
              }
            }
          } else {
            this._onDisposeValue_ = null;
          }
        },
      }),
      fn,
    );
  }

  public constructor(values?: readonly V[] | null) {
    super();

    if (values) {
      const isBatchTop = batchStart();
      for (const value of values) {
        this.add(value);
      }
      isBatchTop && batchFlush();
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
      const { delete_ } = this._onDisposeValue_;
      for (const value of this.values()) {
        delete_.add(value);
      }
      if (delete_.size) {
        const isBatchTop = batchStart();
        tasks.add(this._onDisposeValue_!);
        isBatchTop && batchFlush();
      }
    }
    this._$ = this._onChanged_ = this._onDisposeValue_ = null;
  }

  public override add(value: V): this {
    if (!this.has(value)) {
      const isBatchTop = batchStart();
      this._onDisposeValue_?.delete_.delete(value);
      if (this._onChanged_) {
        this._onChanged_.upsert_.add(value);
        this._onChanged_.delete_.delete(value);
        tasks.add(this._onChanged_);
      }
      super.add(value);
      this._notify_();
      isBatchTop && batchFlush();
    }
    return this;
  }

  public override delete(value: V): boolean {
    if (this.has(value)) {
      const isBatchTop = batchStart();
      if (this._onDisposeValue_) {
        this._onDisposeValue_.delete_.add(value);
        tasks.add(this._onDisposeValue_);
      }
      if (this._onChanged_) {
        this._onChanged_.delete_.add(value);
        this._onChanged_.upsert_.delete(value);
        tasks.add(this._onChanged_);
      }
      this._notify_();
      isBatchTop && batchFlush();
    }
    return super.delete(value);
  }

  public override clear(): void {
    if (this.size) {
      const isBatchTop = batchStart();
      if (this._onDisposeValue_ || this._onChanged_) {
        for (const value of this) {
          if (this._onDisposeValue_) {
            this._onDisposeValue_.delete_.add(value);
            tasks.add(this._onDisposeValue_);
          }
          if (this._onChanged_) {
            this._onChanged_.delete_.add(value);
            this._onChanged_.upsert_.delete(value);
            tasks.add(this._onChanged_);
          }
        }
      }
      super.clear();
      this._notify_();
      isBatchTop && batchFlush();
    }
  }

  /** @internal */
  private _disposed_?: Error | true;

  /** @internal */
  private _$?: OwnedWritable<this> | null;

  /** @internal */
  private _onChanged_?: null | OnChanged<V>;

  /** @internal */
  private _onDisposeValue_?: null | OnDisposeValue<V>;

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

export type ReactiveSet<V> = Omit<OwnedReactiveSet<V>, "dispose">;

export const reactiveSet = <V>(values?: readonly V[] | null): OwnedReactiveSet<V> => new OwnedReactiveSet(values);
