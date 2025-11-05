import { batchFlush, batchStart, type BatchTask, batchTasks } from "./batch";
import { type EventObject, off, on, send, size } from "./event";
import { SyncScheduler, type Scheduler } from "./schedulers";
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

interface Subs<TValue> extends EventObject<TValue> {
  lastVersion_: Version;
}

export type Deps = Map<ReadableImpl, Version>;

const registry = /* @__PURE__ */ new FinalizationRegistry<{
  d: Deps;
  r: WeakRef<ReadableImpl>;
}>(({ d, r }) => {
  for (const dep of d.keys()) {
    dep.dependents_?.delete(r);
  }
});

export interface CreateReadable {
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

/** @internal */
export class ReadableImpl<TValue = any> implements BatchTask {
  /** @internal */
  public readonly [BRAND]: BRAND = BRAND;

  /** @internal */
  public dependents_?: Set<WeakRef<ReadableImpl>>;

  /** @internal */
  public deps_?: Map<ReadableImpl, Version>;

  /** @internal */
  public equal_?: (newValue: TValue, oldValue: TValue) => boolean;

  public name?: string;

  public set?: (value: TValue) => void;

  /** @internal */
  public subs_?: Map<Scheduler, Subs<TValue>>;

  public get version(): Version {
    this.get();
    return this.version_;
  }

  public get value(): TValue {
    return this.get();
  }

  public set value(value: TValue) {
    this.set?.(value);
  }

  /** @internal */
  private disposed_?: Error | true;

  /** @internal */
  private resolveValue_: (self: ReadableImpl<TValue>) => TValue;

  /** @internal */
  private resolveValueError_: any;

  /** @internal */
  private value_: TValue = UNIQUE_VALUE as TValue;

  /** @internal */
  private valueMaybeDirty_ = true;

  /** @internal */
  public version_: Version = -1;

  /** @internal */
  private weakRefSelf_?: WeakRef<ReadableImpl<TValue>>;

  /** @internal */
  private onDisposeValue_?: (oldValue: TValue) => void;

  public constructor(resolveValue: (self: ReadableImpl<TValue>) => TValue, config?: Config<TValue>) {
    this.resolveValue_ = resolveValue;
    this.equal_ = (config?.equal ?? strictEqual) || undefined;
    this.name = config?.name;
    this.onDisposeValue_ = config?.onDisposeValue;
  }

  /** @internal */
  public batchTask_(): void {
    if (this.subs_) {
      for (const scheduler of this.subs_.keys()) {
        scheduler(this);
      }
    }
  }

  /** @internal */
  public schedulerTask_(scheduler: Scheduler): void {
    const subs = this.subs_?.get(scheduler);
    if (subs && size(subs)) {
      const value = this.get();
      if (subs.lastVersion_ !== this.version_) {
        subs.lastVersion_ = this.version_;
        send(subs, value);
      }
    }
  }

  public addDep_(dep: ReadableImpl): void {
    if (strictEqual(this.deps_?.get(dep), dep.version)) return;

    (this.deps_ ??= new Map()).set(dep, dep.version);

    if (!this.weakRefSelf_) {
      registry.register(this, { d: this.deps_, r: (this.weakRefSelf_ = new WeakRef(this)) }, this.deps_);
    }

    (dep.dependents_ ??= new Set()).add(this.weakRefSelf_);
  }

  public dispose(): void {
    if (this.disposed_) return;
    if (process.env.NODE_ENV !== "production") {
      this.disposed_ = new Error("[embra] Readable disposed at:");
    } else {
      this.disposed_ = true;
    }
    batchTasks.delete(this);
    this.dependents_ = this.subs_ = undefined;
    if (this.deps_) {
      registry.unregister(this.deps_);
      if (this.weakRefSelf_) {
        for (const dep of this.deps_.keys()) {
          dep.dependents_?.delete(this.weakRefSelf_);
        }
      }
      this.deps_.clear();
    }
    if (this.onDisposeValue_ && !strictEqual(this.value_, UNIQUE_VALUE)) {
      this.onDisposeValue_(this.value_);
    }
  }

  public get(): TValue {
    if (this.valueMaybeDirty_) {
      // reset state immediately so that recursive notify_ calls can mark this as dirty again
      this.valueMaybeDirty_ = false;
      let changed = !this.deps_;
      if (this.deps_) {
        for (const [dep, version] of this.deps_) {
          if (!strictEqual(dep.version, version)) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        this.resolveValueError_ = UNIQUE_VALUE;
        try {
          const value = this.resolveValue_(this);
          if (!this.equal_?.(value, this.value_)) {
            const oldValue = this.value_;
            this.value_ = value;
            this.version_ = (this.version_ + 1) | 0;
            if (this.onDisposeValue_ && !strictEqual(oldValue, UNIQUE_VALUE) && !strictEqual(oldValue, value)) {
              this.onDisposeValue_(oldValue);
            }
          }
        } catch (e) {
          this.valueMaybeDirty_ = true;
          this.resolveValueError_ = e;
          throw e;
        }
      }
    }
    if (!strictEqual(this.resolveValueError_, UNIQUE_VALUE)) {
      throw this.resolveValueError_;
    }
    if (process.env.NODE_ENV !== "production") {
      if (strictEqual(UNIQUE_VALUE, this.value_)) {
        throw new Error("Cycle detected");
      }
    }
    return this.value_;
  }

  /** @internal */
  public notify_(): void {
    if (this.disposed_) {
      console.error(this, new Error("disposed"));
      if (process.env.NODE_ENV !== "production") {
        console.error(this.disposed_);
      }
    }

    this.valueMaybeDirty_ = true;

    const isFirst = batchStart();

    batchTasks.add(this);

    if (this.dependents_) {
      for (const ref of this.dependents_) {
        const dependent = ref.deref();
        if (dependent && !batchTasks.has(dependent)) {
          dependent.notify_();
        }
      }
    }

    isFirst && batchFlush();
  }

  /** @internal */
  public onReaction_(subscriber: Subscriber<TValue>, scheduler: Scheduler = SyncScheduler): void {
    let subs = this.subs_?.get(scheduler);
    if (!subs) {
      (this.subs_ ??= new Map()).set(scheduler, (subs = { lastVersion_: this.version }));
    } else if (!size(subs)) {
      // start tracking last first on first subscription
      subs.lastVersion_ = this.version;
    }
    on(subs, subscriber);
  }

  public reaction(subscriber: Subscriber<TValue>, scheduler?: Scheduler): Disposer {
    this.onReaction_(subscriber, scheduler);
    return () => this.unsubscribe(subscriber);
  }

  /** @internal */
  public removeDep_(dep: ReadableImpl): void {
    this.deps_?.delete(dep);
    if (this.weakRefSelf_) {
      dep.dependents_?.delete(this.weakRefSelf_);
    }
  }

  public subscribe(subscriber: Subscriber<TValue>, scheduler?: Scheduler): Disposer {
    const disposer = this.reaction(subscriber, scheduler);
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

  public unsubscribe(subscriber?: (...args: any[]) => any, scheduler?: Scheduler): void {
    if (this.subs_) {
      if (subscriber) {
        if (scheduler) {
          const subs = this.subs_.get(scheduler);
          subs && off(subs, subscriber);
        } else {
          for (const subs of this.subs_.values()) {
            off(subs, subscriber);
          }
        }
      } else {
        this.subs_.clear();
      }
    }
  }

  public valueOf(): TValue {
    return this.get();
  }
}

/**
 * Creates an {@link OwnedReadable}.
 *
 * @param value - Initial value.
 * @param config - Optional custom {@link Config}.
 * @returns A tuple containing the {@link OwnedReadable} and a setter function.
 */
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

export interface CreateWritable {
  /**
   * Creates a Writable.
   * @returns A Writable with undefined value.
   */
  <TValue = any>(): OwnedWritable<TValue | undefined>;
  /**
   * Creates a Writable.
   * @param value Initial value.
   * @param config Optional custom config.
   */
  (value: [], config?: Config<any[]>): OwnedWritable<any[]>;
  /**
   * Creates a Writable.
   * @param value Initial value.
   * @param config Optional custom config.
   */
  <TValue = any>(value: TValue, config?: Config<TValue>): OwnedWritable<TValue>;
  /**
   * Creates a Writable.
   * @param value Initial value.
   * @param config Optional custom config.
   */
  <TValue = any>(value?: TValue, config?: Config<TValue | undefined>): OwnedWritable<TValue>;
}

/**
 * Creates an {@link OwnedWritable}.
 *
 * @param value - Initial value.
 * @param config - Optional custom {@link Config}.
 * @returns The created {@link OwnedWritable}.
 */
export const writable: CreateWritable = <TValue = any>(
  value?: TValue,
  config?: Config<TValue>,
): OwnedWritable<NoInfer<TValue | undefined>> => toWritable(...readable(value, config));
