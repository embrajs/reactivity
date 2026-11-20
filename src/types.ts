import { CONTRACT_SYMBOL, type CONTRACT_VERSION } from "./constants";

export type Cleanup = () => void;

/** A pure equivalence relation. It must not mutate reactive state. */
export type Equality<T = any> = (previous: T, next: T) => boolean;

export type NormalizedEquality<T> = Equality<T> | false | null;

export type EqualityConfig<T> = Equality<T> | false | null | undefined;

export type Setter<T = any> = (value: T) => void;

export type Owned<T> = T & {
  dispose(): void;
};

export interface EffectContext {
  dispose(): void;
}

export type WatchEffect = (this: EffectContext) => undefined | Cleanup;

export type Subscriber<T = any> = (this: EffectContext, value: T) => void;

export interface SubscribeOptions {
  /** Deliver synchronously after the current batch. Defaults to false. */
  sync?: boolean;
  /** Deliver the current value during subscription. Defaults to true. */
  immediate?: boolean;
}

export interface Readable<T = any> {
  [CONTRACT_SYMBOL]: CONTRACT_VERSION;
  readonly value: T;
  get(): T;
  /**
   * Shares a consumed-value baseline and broadcast value with subscriptions to
   * this source in the same scheduling mode. Joining pending work can cause an
   * additional callback for existing subscribers.
   */
  subscribe(fn: Subscriber<T>, options?: SubscribeOptions): Cleanup;
}

export interface Writable<T = any> extends Readable<T> {
  value: T;
  set: Setter<T>;
}
