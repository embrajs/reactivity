import { batchFlush, batchStart, batchTasks } from "../batch";
import { type RemoveListener } from "../event";
import { type ReadableProvider, type OwnedWritable, type Readable } from "../interface";
import { writable } from "../readable";
import { strictEqual } from "../utils";
import { onDisposeValue, type OnDisposeValue } from "./utils";

const nonEnumerable = { enumerable: false };

/**
 * OwnedReactiveArray extends the standard Array interface with reactive capabilities.
 *
 * @category ReactiveArray
 */
export class OwnedReactiveArray<V> extends Array<V> implements ReadableProvider<ReadonlyReactiveArray<V>> {
  readonly [n: number]: V;

  /**
   * Gets the length of the array.
   * This is a number one higher than the highest index in the array.
   *
   * Use `.setLength(length)` to change the length of the array.
   */
  declare public readonly length: number;

  /**
   * A Readable that emits the Array itself whenever it changes.
   *
   * @group Readable
   */
  public get $(): Readable<ReadonlyReactiveArray<V>> {
    return (this._$ ??= writable(this, { equal: false }));
  }

  /**
   * Subscribe to events when a value is needed to be disposed.
   *
   * A value is considered for disposal when:
   * - it is deleted from the array.
   * - it is replaced by another value (the old value is removed).
   * - it is cleared from the array.
   * - the array is disposed.
   *
   * @group Events
   * @function
   * @param fn - The function to call when a value is needed to be disposed.
   * @returns A disposer function to unsubscribe from the event.
   *
   * @example
   * ```ts
   * import { reactiveArray } from "@embra/reactivity";
   *
   * const arr = reactiveArray<number>();
   * const disposer = arr.onDisposeValue((value) => {
   *   console.log("Value disposed:", value);
   * });
   * ```
   */
  public readonly onDisposeValue: (fn: (value: V) => void) => RemoveListener = onDisposeValue;

  public constructor(arrayLength?: number);
  public constructor(arrayLength: number);
  public constructor(...items: V[]);
  public constructor(...args: V[]) {
    super(...args);

    Object.defineProperties(this, {
      onDisposeValue: nonEnumerable,
      onDisposeValue_: nonEnumerable,
      set: { ...nonEnumerable, value: this.set },
      _$: nonEnumerable,
      _disposed_: nonEnumerable,
    });
  }

  /**
   * Overwrites the value at the provided index with the given value.
   * If the index is negative, then it replaces from the end of the array.
   * @param index The index of the value to overwrite. If the index is
   * negative, then it replaces from the end of the array.
   * @param value The value to write into the array.
   */
  public set(index: number, value: V): this {
    index = Number(index);
    index = index < 0 ? this.length + index : index;
    if (index >= 0 && Number.isFinite(index) && !strictEqual(this[index], value)) {
      (this as any)[index] = value;
      this._notify_();
    }
    return this;
  }

  public setLength(value: number): void {
    if (value >= 0 && value !== this.length) {
      super.length = value;
      this._notify_();
    }
  }

  public override fill(value: V, start?: number, end?: number): this {
    if (this.length > 0) {
      super.fill(value, start, end);
      this._notify_();
    }
    return this;
  }

  public override push(...items: V[]): number {
    const length = super.push(...items);
    items.length > 0 && this._notify_();
    return length;
  }

  public override pop(): V | undefined {
    if (this.length > 0) {
      const value = super.pop();
      this._notify_();
      return value;
    }
  }

  public override shift(): V | undefined {
    if (this.length > 0) {
      const value = super.shift();
      this._notify_();
      return value;
    }
  }

  public override unshift(...items: V[]): number {
    const length = super.unshift(...items);
    items.length > 0 && this._notify_();
    return length;
  }

  public override splice(start: number, deleteCount?: number): V[];
  public override splice(start: number, deleteCount: number, ...items: V[]): V[];
  public override splice(...args: [number, number, ...V[]]): V[] {
    const removed = super.splice(...args);
    if (removed.length > 0 || args.length > 2) {
      this._notify_();
    }
    return removed;
  }

  public override reverse(): this {
    if (this.length > 1) {
      super.reverse();
      this._notify_();
    }
    return this;
  }

  public override sort(compareFn?: (a: V, b: V) => number): this {
    if (this.length > 1) {
      super.sort(compareFn);
      this._notify_();
    }
    return this;
  }

  public override copyWithin(target: number, start: number, end?: number): this {
    if (this.length > 0) {
      super.copyWithin(target, start, end);
      this._notify_();
    }
    return this;
  }

  /**
   * Replaces the contents of the array with the provided items.
   * @param items The new items to replace the contents of the array with.
   * @returns The array itself.
   */
  public replace(items: Iterable<V>): this {
    const isBatchTop = batchStart();
    let i = 0;
    for (const item of items) {
      this.set(i++, item);
    }
    this.setLength(i);
    isBatchTop && batchFlush();
    return this;
  }

  public dispose(): void {
    if (this._disposed_) return;
    if (process.env.NODE_ENV !== "production") {
      this._disposed_ = new Error("[embra] ReactiveArray disposed at:");
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
        batchTasks.add(this.onDisposeValue_!);
        isBatchTop && batchFlush();
      }
    }
    this._$ = this.onDisposeValue_ = null;
  }

  /** @internal */
  private _disposed_?: Error | true;

  /** @internal */
  private _$?: OwnedWritable<this> | null;

  /** @internal */
  public onDisposeValue_?: null | OnDisposeValue<V>;

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

/**
 * ReactiveArray is {@link OwnedReactiveArray} without the `dispose` method.
 *
 * @category ReactiveArray
 */
export type ReactiveArray<V> = Omit<OwnedReactiveArray<V>, "dispose">;

/**
 * ReadonlyReactiveArray is a readonly interface for {@link ReactiveArray}.
 *
 * @category ReactiveArray
 */
export interface ReadonlyReactiveArray<V> extends ReadonlyArray<V> {
  /**
   * A Readable that emits the Array itself whenever it changes.
   *
   * @group Readable
   */
  readonly $: Readable<readonly V[]>;
  /**
   * Gets the length of the array.
   * This is a number one higher than the highest index in the array.
   *
   * Use `.setLength(length)` to change the length of the array.
   */
  readonly length: number;
  /**
   * Overwrites the value at the provided index with the given value.
   * If the index is negative, then it replaces from the end of the array.
   * @param index The index of the value to overwrite. If the index is
   * negative, then it replaces from the end of the array.
   * @param value The value to write into the array.
   */
  set(index: number, value: V): this;
  /**
   * Updates the length of the array.
   * @param value The new length of the array.
   */
  setLength(value: number): void;
  /**
   * Subscribe to events when a value is needed to be disposed.
   *
   * A value is considered for disposal when:
   * - it is deleted from the array.
   * - it is replaced by another value (the old value is removed).
   * - it is cleared from the array.
   * - the array is disposed.
   *
   * @group Events
   * @function
   * @param fn - The function to call when a value is needed to be disposed.
   * @returns A disposer function to unsubscribe from the event.
   *
   * @example
   * ```ts
   * import { reactiveArray } from "@embra/reactivity";
   *
   * const arr = reactiveArray<number>();
   * const disposer = arr.onDisposeValue((value) => {
   *   console.log("Value disposed:", value);
   * });
   * ```
   */
  readonly onDisposeValue: (fn: (value: V) => void) => RemoveListener;
}

/**
 * Creates a new {@link OwnedReactiveArray}.
 *
 * @category ReactiveArray
 * @param values - Initial values for the reactive array.
 * @returns A new instance of {@link OwnedReactiveArray}.
 *
 * @example
 * ```ts
 * import { reactiveArray } from "@embra/reactivity";
 *
 * const arr$ = reactiveArray([1, 2, 3]);
 * ```
 */
export const reactiveArray = <V>(values?: Iterable<V> | null): OwnedReactiveArray<V> => {
  const arr = new OwnedReactiveArray<V>();
  if (values) {
    arr.push(...values);
  }
  return arr;
};
