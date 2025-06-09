import { batchFlush, batchStart, tasks } from "./batch";
import {
  type OwnedReadable,
  type OwnedWritable,
  type Config,
  type Disposer,
  type Readable,
  type SetValue,
  type Subscriber,
  type Version,
  type Writable,
} from "./typings";
import { BRAND, strictEqual, UNIQUE_VALUE } from "./utils";

export type Deps = Map<ReadableImpl, Version>;

const registry = /* @__PURE__ */ new FinalizationRegistry<{
  d: Deps;
  r: WeakRef<ReadableImpl>;
}>(({ d, r }) => {
  for (const dep of d.keys()) {
    dep.dependents_?.delete(r);
  }
});

interface CreateReadable {
  /**
   * Creates a Readonly with the given value.
   *
   * @returns A tuple with the Readonly and a function to set the value.
   */
  <TValue = any>(): [OwnedReadable<NoInfer<TValue> | undefined>, SetValue<NoInfer<TValue> | undefined>];
  /**
   * Creates a Readonly with the given value.
   *
   * @param value
   * @param config Optional custom config.
   * @returns A tuple with the Readonly and a function to set the value.
   */
  (value: [], config?: Config<any[]>): [OwnedReadable<any[]>, SetValue<any[]>];
  /**
   * Creates a Readonly with the given value.
   *
   * @param value
   * @param config Optional custom config.
   * @returns A tuple with the Readonly and a function to set the value.
   */
  <TValue = any>(value: TValue, config?: Config<TValue>): [OwnedReadable<NoInfer<TValue>>, SetValue<NoInfer<TValue>>];
  /**
   * Creates a Readonly with the given value.
   *
   * @param value
   * @param config Optional custom config.
   * @returns A tuple with the Readonly and a function to set the value.
   */
  <TValue = any>(
    value?: TValue,
    config?: Config<TValue>,
  ): [OwnedReadable<NoInfer<TValue | undefined>>, SetValue<NoInfer<TValue | undefined>>];
}

export class ReadableImpl<TValue = any> {
  public readonly [BRAND]: BRAND = BRAND;

  /**
   * @internal
   */
  public dependents_?: Set<WeakRef<ReadableImpl>>;

  /**
   * @internal
   */
  public deps_?: Map<ReadableImpl, Version>;

  /**
   * @internal
   */
  public eager_?: boolean;

  /**
   * @internal
   */
  public equal_?: (newValue: TValue, oldValue: TValue) => boolean;

  /**
   * @internal
   */
  public lastSubInvokeVersion_: Version = -1;

  public readonly name?: string;

  public set?: (value: TValue) => void;

  /**
   * @internal
   */
  public subs_?: Set<Subscriber<TValue>>;

  public get $version(): Version {
    this.get();
    return this._version_;
  }

  public get value(): TValue {
    return this.get();
  }

  public set value(value: TValue) {
    this.set?.(value);
  }

  /**
   * @internal
   */
  private _disposed_?: Error;

  /**
   * @internal
   */
  private _resolveValue_: (self: ReadableImpl<TValue>) => TValue;

  /**
   * @internal
   */
  private _resolveValueError_: any;

  /**
   * @internal
   */
  private _value_: TValue = UNIQUE_VALUE as TValue;

  /**
   * @internal
   */
  private _valueMaybeDirty_ = true;

  /**
   * @internal
   */
  private _version_: Version = -1;

  /**
   * @internal
   */
  private _weakRefSelf_?: WeakRef<ReadableImpl<TValue>>;

  public constructor(
    resolveValue: (self: ReadableImpl<TValue>) => TValue,
    config?: Config<TValue>,
    deps?: Map<ReadableImpl, Version>,
  ) {
    this._resolveValue_ = resolveValue;
    this.equal_ = (config?.equal ?? strictEqual) || undefined;
    this.name = config?.name;
    this.deps_ = deps;
  }

  public addDep_(dep: ReadableImpl): void {
    if (strictEqual(this.deps_?.get(dep), dep.$version)) return;

    (this.deps_ ??= new Map()).set(dep, dep.$version);

    if (!this._weakRefSelf_) {
      registry.register(this, { d: this.deps_, r: (this._weakRefSelf_ = new WeakRef(this)) }, this.deps_);
    }

    (dep.dependents_ ??= new Set()).add(this._weakRefSelf_);
  }

  public dispose(): void {
    if (process.env.NODE_ENV !== "production") {
      this._disposed_ = new Error("[embra] Readable disposed at:");
    }
    tasks.delete(this);
    this.dependents_ = undefined;
    if (this.deps_) {
      registry.unregister(this.deps_);
      if (this._weakRefSelf_) {
        for (const dep of this.deps_.keys()) {
          dep.dependents_?.delete(this._weakRefSelf_);
        }
      }
      this.deps_.clear();
    }
  }

  public get(): TValue {
    if (this._valueMaybeDirty_) {
      // reset state immediately so that recursive notify_ calls can mark this as dirty again
      this._valueMaybeDirty_ = false;
      let changed = !this.deps_;
      if (this.deps_) {
        for (const [dep, version] of this.deps_) {
          if (!strictEqual(dep.$version, version)) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        this._resolveValueError_ = UNIQUE_VALUE;
        try {
          const value = this._resolveValue_(this);
          if (!this.equal_?.(value, this._value_)) {
            this._value_ = value;
            this._version_ = (this._version_ + 1) | 0;
          }
        } catch (e) {
          this._valueMaybeDirty_ = true;
          this._resolveValueError_ = e;
          throw e;
        }
      }
    }
    if (!strictEqual(this._resolveValueError_, UNIQUE_VALUE)) {
      throw this._resolveValueError_;
    }
    if (process.env.NODE_ENV !== "production") {
      if (strictEqual(UNIQUE_VALUE, this._value_)) {
        throw new Error("Cycle detected");
      }
    }
    return this._value_;
  }

  /**
   * @internal
   */
  public notify_ = (): void => {
    if (process.env.NODE_ENV !== "production") {
      if (this._disposed_) {
        console.error(new Error("[embra] Updating a disposed Readable."));
        console.error((this as any)._DEV_ValDisposed_);
      }
    }

    this._valueMaybeDirty_ = true;

    const isFirst = batchStart();

    tasks.add(this);

    if (this.dependents_) {
      for (const ref of this.dependents_) {
        const dependent = ref.deref();
        if (dependent && !tasks.has(dependent)) {
          dependent.notify_();
        }
      }
    }

    isFirst && batchFlush();
  };

  /** @internal */
  public onReaction_(subscriber: Subscriber<TValue>): void {
    if (!this.subs_?.size) {
      // start tracking last first on first subscription
      this.lastSubInvokeVersion_ = this.$version;
    }
    (this.subs_ ??= new Set()).add(subscriber);
  }

  public reaction(subscriber: Subscriber<TValue>): Disposer {
    this.onReaction_(subscriber);
    return this.unsubscribe.bind(this, subscriber);
  }

  public removeDep_(dep: ReadableImpl): void {
    this.deps_?.delete(dep);
    if (this._weakRefSelf_) {
      dep.dependents_?.delete(this._weakRefSelf_);
    }
  }

  public subscribe(subscriber: Subscriber<TValue>): Disposer {
    const disposer = this.reaction(subscriber);
    subscriber(this.get());
    return disposer;
  }

  /**
   * @returns the JSON representation of `this.value`.
   *
   * @example
   * ```js
   * const v$ = writable(writable(writable({ a: 1 })));
   * JSON.stringify(v$); // '{"a":1}'
   * ```
   */
  public toJSON(key?: string): unknown {
    const value = this.get() as null | undefined | { toJSON?: (key?: string) => unknown };
    return value?.toJSON ? value.toJSON(key) : value;
  }

  /**
   * @returns the string representation of `this.value`.
   *
   * @example
   * ```js
   * const v$ = writable(writable(writable(1)));
   * console.log(`${v$}`); // "1"
   * ```
   */
  public toString(): string {
    return "" + this.toJSON();
  }

  public unsubscribe(subscriber: (...args: any[]) => any): void {
    this.subs_?.delete(subscriber);
  }

  public clear(): void {
    this.subs_?.clear();
  }

  public valueOf(): TValue {
    return this.get();
  }
}

export const readable: CreateReadable = <TValue = any>(
  value?: TValue,
  config?: Config<TValue | undefined>,
): [OwnedReadable<NoInfer<TValue> | undefined>, SetValue<NoInfer<TValue> | undefined>] => {
  let currentValue = value;

  const get = () => currentValue;

  const v = new ReadableImpl(get, config);

  const set = (value: TValue | undefined): void => {
    if (!v.equal_?.(value, currentValue)) {
      currentValue = value;
      v.notify_();
    }
  };

  return [v, set];
};

export interface ToWritable {
  <TValue>($: OwnedReadable<TValue>, set: (this: void, value: TValue) => void): OwnedWritable<TValue>;
  <TValue>($: Readable<TValue>, set: (this: void, value: TValue) => void): Writable<TValue>;
}

/**
 * Converts a Readable to a Writable By adding a setter function.
 * @param $
 * @param set a function that sets the value of Readable.
 * @returns The same Readable with the new setter.
 */
export const toWritable: ToWritable = <TValue>(
  $: Readable<TValue>,
  set: (this: void, value: TValue) => void,
): OwnedWritable<TValue> => ((($ as OwnedWritable<TValue>).set = set), $ as OwnedWritable<TValue>);

interface CreateWritable {
  /**
   * Creates a Writable.
   * @returns A Writable with undefined value.
   */
  <TValue = any>(): Writable<TValue | undefined>;
  /**
   * Creates a Writable.
   * @param value Initial value.
   * @param config Optional custom config.
   */
  (value: [], config?: Config<any[]>): Writable<any[]>;
  /**
   * Creates a Writable.
   * @param value Initial value.
   * @param config Optional custom config.
   */
  <TValue = any>(value: TValue, config?: Config<TValue>): Writable<NoInfer<TValue>>;
  /**
   * Creates a Writable.
   * @param value Initial value.
   * @param config Optional custom config.
   */
  <TValue = any>(value?: TValue, config?: Config<TValue | undefined>): Writable<NoInfer<TValue>>;
}

export const writable: CreateWritable = <TValue = any>(
  value?: TValue,
  config?: Config<TValue>,
): OwnedWritable<NoInfer<TValue | undefined>> => toWritable(...readable(value, config));
