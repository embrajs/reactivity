import {
  appendDep,
  appendSub,
  clearSubs,
  type IDepItem,
  type IDepList,
  type ISubItem,
  type ISubList,
  removeSub,
} from "./broadcast";
import { CONTRACT_SYMBOL, CONTRACT_VERSION, Flags } from "./constants";
import { getRuntime, type RuntimeQueue } from "./runtime";
import type { Cleanup, Equality, EqualityConfig, NormalizedEquality, Owned, Setter } from "./types";

const runtime = /* @__PURE__ */ getRuntime<Observer, QueueItem>();
const { NOOP_, syncQueue_, asyncQueue_ } = runtime;

export type Subscriber<T = any> = (this: EffectContext, value: T) => void;

export interface SubscribeOptions {
  /** Deliver synchronously after the current batch. Defaults to false. */
  sync?: boolean;
  /** Deliver the current value during subscription. Defaults to true. */
  immediate?: boolean;
}

export interface EffectContext {
  dispose(): void;
}

export type EffectFn = (this: EffectContext) => undefined | Cleanup;
export type WatchEffect = EffectFn;

type Source<T = any> = ValueNode<T> | ComputedNode<T>;
type Observer = ComputedNode | WatchNode;
type QueueItem = Source | WatchNode;

class Link implements ISubItem, IDepItem {
  // TrackPhase belongs to collection; Dirty records a published Effect input.
  flags_: Flags;
  subNext_: Link | null;
  subPrev_: Link | null;
  depNext_: Link | null;
  source_: Source;
  observer_: Observer;
  // Only Watch inputs retain a consumed value; Computed inputs leave this null.
  value_: any;

  constructor(source: Source, observer: Observer) {
    this.flags_ = Flags.None;
    this.subNext_ = null;
    this.subPrev_ = null;
    this.depNext_ = null;
    this.source_ = source;
    this.observer_ = observer;
    this.value_ = null;
  }
}

interface ValueOptions<T> {
  name?: string;
  equal?: EqualityConfig<T>;
}

class ValueNode<T = any> implements ISubList, Writable<T> {
  // Keep the shared Source fields in the same construction order as ComputedNode.
  flags_: Flags;
  subHead_: Link | null;
  subTail_: Link | null;
  declare [CONTRACT_SYMBOL]: CONTRACT_VERSION;
  name: string;
  value_: T;
  equal_: NormalizedEquality<T>;
  syncSubscriptions_: SubscriptionList | null;
  asyncSubscriptions_: SubscriptionList | null;
  declare __dev_disposed_at: Error | null;
  get: () => T;
  set: Setter<T>;

  constructor(value: T, options?: ValueOptions<T>) {
    this.flags_ = Flags.KindValueNode;
    this.subHead_ = null;
    this.subTail_ = null;
    this[CONTRACT_SYMBOL] = CONTRACT_VERSION;
    this.name = options?.name ?? "";
    this.value_ = value;
    this.equal_ = options?.equal ?? null;
    this.syncSubscriptions_ = null;
    this.asyncSubscriptions_ = null;
    if (process.env.NODE_ENV !== "production") {
      this.__dev_disposed_at = null;
    }

    this.get = () => this.value;

    this.set = (value) => {
      if (process.env.NODE_ENV !== "production") {
        if (this.flags_ & Flags.Disposed) {
          if (this.__dev_disposed_at) {
            console.error("ValueNode disposed at:", this.__dev_disposed_at);
          }
          throw new Error("disposed");
        }
        if (runtime.__dev_currentComputation) {
          throw new Error("write during computation");
        }
      }
      const equal = this.equal_;
      if (equal === null ? this.value_ !== value : equal === false || different(equal, this.value_, value)) {
        this.value_ = value;
        if (this.subHead_ !== null || this.flags_ & Flags.HasSubscriptions) {
          if (!(this.flags_ & Flags.Dirty)) {
            this.flags_ |= Flags.Dirty;
            propagate(this);
          }
          if (!(syncQueue_.flags_ & Flags.Running)) {
            flushEffects();
          }
        }
      }
    };
  }

  get value(): T {
    const observer = runtime.currentObserver_;
    if (observer !== null && !(this.flags_ & Flags.Disposed)) {
      this.flags_ &= ~Flags.Dirty;
      observer.track_(this);
    }
    return this.value_;
  }

  set value(value: T) {
    this.set(value);
  }

  subscribe(callback: Subscriber<T>, options?: SubscribeOptions): Cleanup {
    return createSubscription(this, callback, options);
  }

  dispose(): void {
    if (!(this.flags_ & Flags.Disposed)) {
      this.flags_ = Flags.KindValueNode | Flags.Disposed;
      if (process.env.NODE_ENV !== "production") {
        this.__dev_disposed_at = new Error();
      }
      clearSubs(this);
      disposeSubscriptions(this);
    }
  }
}

class ComputedNode<T = any> implements ISubList, IDepList, Readable<T> {
  // Keep the shared Source fields in the same construction order as ValueNode.
  flags_: Flags;
  subHead_: Link | null;
  subTail_: Link | null;
  declare [CONTRACT_SYMBOL]: CONTRACT_VERSION;
  name: string;
  value_: T | undefined;
  equal_: NormalizedEquality<T>;
  syncSubscriptions_: SubscriptionList | null;
  asyncSubscriptions_: SubscriptionList | null;
  declare __dev_disposed_at: Error | null;
  get: () => T;
  depHead_: Link | null;
  // The confirmed tail during collection; the actual tail outside collection.
  depTail_: Link | null;
  compute_: ((...values: any[]) => T) | null;

  constructor(compute: (...values: any[]) => T, options?: ReadableOptions<T>) {
    this.flags_ = Flags.KindComputedNode | Flags.Dirty;
    this.subHead_ = null;
    this.subTail_ = null;
    this[CONTRACT_SYMBOL] = CONTRACT_VERSION;
    this.name = options?.name ?? "";
    this.value_ = undefined;
    this.equal_ = options?.equal ?? null;
    this.syncSubscriptions_ = null;
    this.asyncSubscriptions_ = null;
    if (process.env.NODE_ENV !== "production") {
      this.__dev_disposed_at = null;
    }
    this.get = () => this.value;
    this.depHead_ = null;
    this.depTail_ = null;
    this.compute_ = compute;
  }

  track_(source: Source): void {
    trackDependency(source, this);
  }

  get value(): T {
    if (this.flags_ & (Flags.Dirty | Flags.Pending | Flags.Running)) {
      updateComputed(this);
    }
    const observer = runtime.currentObserver_;
    if (observer !== null && !(this.flags_ & Flags.Disposed)) {
      observer.track_(this);
    }
    return this.value_ as T;
  }

  subscribe(callback: Subscriber<T>, options?: SubscribeOptions): Cleanup {
    return createSubscription(this, callback, options);
  }

  dispose(): void {
    if (!(this.flags_ & Flags.Disposed)) {
      this.flags_ = Flags.KindComputedNode | Flags.Disposed;
      if (process.env.NODE_ENV !== "production") {
        this.__dev_disposed_at = new Error();
      }
      this.depTail_ = null;
      cleanupObserver(this);
      this.compute_ = null;
      clearSubs(this);
      disposeSubscriptions(this);
    }
  }
}

// Subscriptions are source-owned records, not graph observers or queue entries.
class SubscriptionList implements ISubList {
  flags_: Flags;
  subHead_: Subscription | null;
  subTail_: Subscription | null;
  value_: any;
  source_: Source;
  next_: Subscription | null;
  end_: Subscription | null;

  constructor(source: Source, flags: Flags, value: any) {
    this.flags_ = flags;
    this.subHead_ = null;
    this.subTail_ = null;
    this.value_ = value;
    this.source_ = source;
    this.next_ = null;
    this.end_ = null;
  }
}

class Subscription implements EffectContext {
  list_: SubscriptionList | null;
  callback_: Subscriber;
  subNext_: Subscription | null;
  subPrev_: Subscription | null;
  dispose: Cleanup;

  constructor(list: SubscriptionList | null, callback: Subscriber) {
    this.list_ = list;
    this.callback_ = callback;
    this.subNext_ = null;
    this.subPrev_ = null;

    this.dispose = (): void => {
      const list = this.list_;
      if (list !== null) {
        this.list_ = null;
        // Keep a broadcast's cursor/boundary valid when callbacks unsubscribe.
        if (list.next_ === this) {
          list.next_ = this.subNext_;
        }
        if (list.end_ === this) {
          list.end_ = this.subPrev_;
        }
        removeSub(list, this);
        this.callback_ = NOOP_;
        if (list.subHead_ === null) {
          const source = list.source_;
          if (!(list.flags_ & Flags.QueueAsync)) {
            if (source.syncSubscriptions_ === list) {
              source.syncSubscriptions_ = null;
            }
          } else if (source.asyncSubscriptions_ === list) {
            source.asyncSubscriptions_ = null;
          }
          if (source.syncSubscriptions_ === null && source.asyncSubscriptions_ === null) {
            source.flags_ &= ~Flags.HasSubscriptions;
          }
          unlinkDependencies(releaseUnusedSource(source));
        }
      }
    };
  }
}

class WatchNode implements IDepList, EffectContext {
  flags_: Flags;
  depHead_: Link | null;
  depTail_: Link | null;
  cleanup_: Cleanup | null;
  callback_: (this: EffectContext) => void | Cleanup;
  dispose: Cleanup;

  constructor(callback: WatchEffect, flags: Flags) {
    this.flags_ = Flags.KindSubscriberNode | Flags.Connected | flags;
    this.depHead_ = null;
    this.depTail_ = null;
    this.cleanup_ = null;
    this.callback_ = callback;

    this.dispose = (): void => {
      if (!(this.flags_ & Flags.Disposed)) {
        this.flags_ |= Flags.Disposed;
        if (!(this.flags_ & Flags.Running)) {
          disposeEffect(this);
        }
      }
    };
  }
  track_(source: Source): void {
    const link = trackDependency(source, this);
    if (link !== undefined) {
      link.value_ = source.value_;
    }
  }
}

function different(equal: Equality, previous: any, next: any): boolean {
  const previousObserver = runtime.currentObserver_;
  runtime.currentObserver_ = null;
  let previousComputation: unknown;
  if (process.env.NODE_ENV !== "production") {
    previousComputation = runtime.__dev_currentComputation;
    runtime.__dev_currentComputation = equal;
  }
  try {
    return !equal(previous, next);
  } finally {
    runtime.currentObserver_ = previousObserver;
    if (process.env.NODE_ENV !== "production") {
      runtime.__dev_currentComputation = previousComputation;
    }
  }
}

function connectObserver(observer: Observer): void {
  if (!(observer.flags_ & Flags.Connected)) {
    observer.flags_ |= Flags.Connected;
    for (let link = observer.depHead_; link !== null; link = link.depNext_) {
      subscribeLink(link);
    }
  }
}

function subscribeLink(link: Link): void {
  const source = link.source_;
  if (!(source.flags_ & Flags.Disposed)) {
    appendSub(source, link);
    if ((source.flags_ & Flags.KindMask) === Flags.KindComputedNode) {
      connectObserver(source as ComputedNode);
    }
  }
}

function releaseUnusedSource(source: Source): Link | null {
  const flags = source.flags_;
  if (
    (flags & (Flags.KindMask | Flags.Disposed)) === Flags.KindComputedNode &&
    source.subHead_ === null &&
    !(flags & Flags.HasSubscriptions)
  ) {
    const node = source as ComputedNode;
    node.flags_ = (flags | Flags.Dirty) & ~Flags.Connected;
    const deps = node.depHead_;
    if (!(flags & Flags.DepsStatic)) {
      node.depHead_ = node.depTail_ = null;
    }
    return deps;
  }
  return null;
}

function unlinkDependencies(first: Link | null): void {
  let link = first;
  let stack: Link | null = null;
  // No user callbacks run here. Unlinked subNext pointers hold the local stack;
  // depNext remains intact for static inputs and resumes the next sibling.
  while (link !== null || stack !== null) {
    if (link === null) {
      const frame: Link = stack!;
      stack = frame.subNext_;
      frame.subNext_ = null;
      link = frame.depNext_;
      continue;
    }
    const next: Link | null = link.depNext_;
    const source = link.source_;
    if (link.subPrev_ !== null || source.subHead_ === link) {
      removeSub(source, link);
      const deps = releaseUnusedSource(source);
      if (deps !== null) {
        if (next !== null) {
          link.subNext_ = stack;
          stack = link;
        }
        link = deps;
        continue;
      }
    }
    link = next;
  }
}

function trackDependency(source: Source, observer: Observer): Link | undefined {
  const tail = observer.depTail_;
  if (tail !== null && tail.source_ === source) {
    return;
  }
  const phase = observer.flags_ & Flags.TrackPhase;
  let link = tail !== null ? tail.depNext_ : observer.depHead_;
  if (link === null || link.source_ !== source) {
    const last = source.subTail_;
    if (last !== null && last.observer_ === observer && (last.flags_ & Flags.TrackPhase) === phase) {
      return;
    }
    const next = link;
    link = new Link(source, observer);
    link.depNext_ = next;
    if (tail !== null) {
      tail.depNext_ = link;
    } else {
      observer.depHead_ = link;
    }
    subscribeLink(link);
  }
  link.flags_ = phase;
  observer.depTail_ = link;
  return link;
}

function cleanupObserver(observer: Observer): void {
  const tail = observer.depTail_;
  const link = tail !== null ? tail.depNext_ : observer.depHead_;
  if (link === null) {
    return;
  }
  if (tail !== null) {
    tail.depNext_ = null;
  } else {
    observer.depHead_ = null;
  }
  unlinkDependencies(link);
}

// A publication dirties direct consumers; descendants only need validation.
function queueSource(source: Source, mode: Flags): void {
  const queued = mode & Flags.QueueAsync ? Flags.QueuedAsyncSource : Flags.QueuedSyncSource;
  if (!(source.flags_ & queued)) {
    source.flags_ |= queued;
    const queue = mode & Flags.QueueAsync ? asyncQueue_ : syncQueue_;
    queue.items_[queue.tail_++] = source;
    if (mode & Flags.QueueAsync && !(queue.flags_ & Flags.Running)) {
      queue.flags_ |= Flags.Running;
      queueMicrotask(flushAsyncQueue);
    }
  }
}

function queueSubscriptions(source: Source, changed: Flags): void {
  if (source.flags_ & Flags.HasSubscriptions) {
    const sync = source.syncSubscriptions_;
    if (sync !== null) {
      if (changed & Flags.Dirty) {
        sync.flags_ |= Flags.Dirty;
      }
      queueSource(source, Flags.None);
    }
    const async = source.asyncSubscriptions_;
    if (async !== null) {
      if (changed & Flags.Dirty) {
        async.flags_ |= Flags.Dirty;
      }
      queueSource(source, Flags.QueueAsync);
    }
  }
}

function enqueueWatch(observer: WatchNode, flags: Flags): void {
  if (!(flags & (Flags.Disposed | Flags.QueuedSyncSource))) {
    observer.flags_ = flags | Flags.QueuedSyncSource;
    const queue = flags & Flags.QueueAsync ? asyncQueue_ : syncQueue_;
    queue.items_[queue.tail_++] = observer;
    if (queue === asyncQueue_ && !(queue.flags_ & Flags.Running)) {
      queue.flags_ |= Flags.Running;
      queueMicrotask(flushAsyncQueue);
    }
  }
}

// A write confirms direct inputs. Descendants only need upstream validation.
function propagate(source: Source): void {
  queueSubscriptions(source, Flags.Dirty);
  for (let link = source.subHead_; link !== null; link = link.subNext_) {
    const observer = link.observer_;
    const flags = observer.flags_;
    if ((flags & Flags.KindMask) === Flags.KindComputedNode) {
      observer.flags_ = flags | Flags.Pending | Flags.Dirty;
      if (!(flags & Flags.Pending)) {
        propagatePending(observer as ComputedNode);
      }
    } else {
      link.flags_ |= Flags.Dirty;
      enqueueWatch(observer as WatchNode, flags);
    }
  }
}

function propagatePending(source: ComputedNode): void {
  queueSubscriptions(source, Flags.None);
  for (let link = source.subHead_; link !== null; link = link.subNext_) {
    const observer = link.observer_;
    const flags = observer.flags_;
    if ((flags & Flags.KindMask) === Flags.KindComputedNode) {
      observer.flags_ = flags | Flags.Pending;
      if (!(flags & Flags.Pending)) {
        propagatePending(observer as ComputedNode);
      }
    } else {
      if (!(flags & Flags.Disposed)) {
        queueSource(source, flags);
      }
    }
  }
}

function readSource(source: Source): any {
  if (source.flags_ & (Flags.Dirty | Flags.Pending | Flags.Running)) {
    if ((source.flags_ & Flags.KindMask) === Flags.KindComputedNode) {
      updateComputed(source as ComputedNode);
    } else {
      source.flags_ &= ~Flags.Dirty;
    }
  }
  return source.value_;
}

function confirmChange(source: Source): void {
  if (source.flags_ & Flags.HasSubscriptions) {
    if (source.syncSubscriptions_ !== null) {
      source.syncSubscriptions_.flags_ |= Flags.Dirty;
    }
    if (source.asyncSubscriptions_ !== null) {
      source.asyncSubscriptions_.flags_ |= Flags.Dirty;
    }
  }
  for (let link = source.subHead_; link !== null; link = link.subNext_) {
    if ((link.observer_.flags_ & Flags.KindMask) === Flags.KindComputedNode) {
      link.observer_.flags_ |= Flags.Dirty;
    } else {
      link.flags_ |= Flags.Dirty;
      enqueueWatch(link.observer_ as WatchNode, link.observer_.flags_);
    }
  }
}

function updateComputed(node: ComputedNode): void {
  if (node.flags_ & Flags.Running) {
    throw new Error("loop detected");
  }
  if (!(node.flags_ & Flags.Dirty)) {
    for (let link = node.depHead_; link !== null; link = link.depNext_) {
      readSource(link.source_);
      if (node.flags_ & Flags.Dirty) {
        break;
      }
    }
    if (!(node.flags_ & Flags.Dirty)) {
      node.flags_ &= ~Flags.Pending;
      return;
    }
  }
  connectObserver(node);
  const previousObserver = runtime.currentObserver_;
  const dynamic = !(node.flags_ & Flags.DepsStatic);
  node.flags_ |= Flags.Running;
  let previousComputation: unknown;
  if (process.env.NODE_ENV !== "production") {
    previousComputation = runtime.__dev_currentComputation;
    runtime.__dev_currentComputation = node;
  }
  try {
    if (dynamic) {
      node.flags_ ^= Flags.TrackPhase;
      node.depTail_ = null;
      runtime.currentObserver_ = node;
    } else {
      runtime.currentObserver_ = null;
    }
    const compute = node.compute_!;
    const first = node.depHead_;
    const value = dynamic
      ? compute()
      : first !== null && first.depNext_ === null
        ? compute(readSource(first.source_))
        : callStatic(compute, first);
    // different() owns tracking isolation for custom equality callbacks.
    const equal = node.equal_;
    if (
      equal === null
        ? node.value_ !== value
        : equal === false || !(node.flags_ & Flags.Initialized) || different(equal, node.value_, value)
    ) {
      node.value_ = value;
      confirmChange(node);
    }
  } finally {
    node.flags_ = (node.flags_ | Flags.Initialized) & ~(Flags.Dirty | Flags.Pending | Flags.Running);
    runtime.currentObserver_ = previousObserver;
    if (dynamic) {
      cleanupObserver(node);
    }
    if (process.env.NODE_ENV !== "production") {
      runtime.__dev_currentComputation = previousComputation;
    }
  }
}

function callStatic(callback: (...values: any[]) => any, first: Link | null): any {
  const second = first === null ? null : first.depNext_;
  if (second !== null && second.depNext_ === null) {
    return callback(readSource(first!.source_), readSource(second.source_));
  }
  const values = [];
  for (let link = first; link !== null; link = link.depNext_) {
    values.push(readSource(link.source_));
  }
  return callback(...values);
}

function runCleanup(effect: WatchNode): void {
  const cleanup = effect.cleanup_;
  effect.cleanup_ = null;
  if (cleanup !== null) {
    const previousObserver = runtime.currentObserver_;
    runtime.currentObserver_ = null;
    try {
      cleanup();
    } finally {
      runtime.currentObserver_ = previousObserver;
    }
  }
}

function disposeEffect(effect: WatchNode): void {
  effect.flags_ &= ~Flags.Connected;
  effect.depTail_ = null;
  cleanupObserver(effect);
  effect.callback_ = NOOP_;
  runCleanup(effect);
}

function runEffect(effect: WatchNode): void {
  const previousObserver = runtime.currentObserver_;
  runtime.currentObserver_ = null;
  effect.flags_ |= Flags.Running;
  try {
    runCleanup(effect);
    if (!(effect.flags_ & Flags.Disposed)) {
      effect.flags_ ^= Flags.TrackPhase;
      effect.depTail_ = null;
      runtime.currentObserver_ = effect;
      effect.cleanup_ = effect.callback_() || null;
    }
  } finally {
    runtime.currentObserver_ = previousObserver;
    effect.flags_ &= ~Flags.Running;
    if (effect.flags_ & Flags.Disposed) {
      disposeEffect(effect);
    } else {
      cleanupObserver(effect);
    }
  }
}

function hasEffectChange(effect: WatchNode): boolean {
  for (let link = effect.depHead_; link !== null; link = link.depNext_) {
    const source = link.source_;
    if (!(source.flags_ & Flags.Disposed)) {
      readSource(source);
      if (link.flags_ & Flags.Dirty) {
        const equal = source.equal_;
        if (
          equal === null
            ? link.value_ !== source.value_
            : equal === false || different(equal, link.value_, source.value_)
        ) {
          return true;
        }
        link.flags_ &= ~Flags.Dirty;
        link.value_ = source.value_;
      }
    }
  }
  return false;
}

function clearQueue(queue: RuntimeQueue<QueueItem>): void {
  for (let i = queue.head_; i < queue.tail_; i++) {
    const item = queue.items_[i];
    if (item !== undefined) {
      item.flags_ &= ~(Flags.QueuedSyncSource | Flags.QueuedAsyncSource);
      queue.items_[i] = undefined;
    }
  }
  queue.head_ = queue.tail_ = 0;
}

function flushEffects(mode: Flags = Flags.None): void {
  const previousObserver = runtime.currentObserver_;
  runtime.currentObserver_ = null;
  syncQueue_.flags_ |= Flags.Running;
  try {
    while (syncQueue_.head_ < syncQueue_.tail_ || (mode & Flags.QueueAsync && asyncQueue_.head_ < asyncQueue_.tail_)) {
      const queue = syncQueue_.head_ < syncQueue_.tail_ ? syncQueue_ : asyncQueue_;
      const queueMode = queue === asyncQueue_ ? Flags.QueueAsync : Flags.None;
      // Finish the current async wave, then drain sync writes before the next wave.
      const limit = queueMode & Flags.QueueAsync ? queue.tail_ : Infinity;
      let i = queue.head_;
      for (; i < queue.tail_ && i < limit; i++) {
        const item = queue.items_[i]!;
        queue.items_[i] = undefined;
        if ((item.flags_ & Flags.KindMask) === Flags.KindSubscriberNode) {
          item.flags_ &= ~Flags.QueuedSyncSource;
          if (!(item.flags_ & Flags.Disposed) && hasEffectChange(item as WatchNode)) {
            runEffect(item as WatchNode);
          }
        } else {
          item.flags_ &= ~(queueMode & Flags.QueueAsync ? Flags.QueuedAsyncSource : Flags.QueuedSyncSource);
          if (!(item.flags_ & Flags.Disposed)) {
            const source = item as Source;
            if ((queueMode & Flags.QueueAsync ? source.asyncSubscriptions_ : source.syncSubscriptions_) !== null) {
              broadcastSource(source, queueMode);
            } else if (source.subHead_ !== null) {
              readSource(source);
            }
          }
        }
      }
      queue.head_ = i;
      if (i === queue.tail_) {
        queue.head_ = queue.tail_ = 0;
      }
    }
  } catch (error) {
    clearQueue(syncQueue_);
    clearQueue(asyncQueue_);
    throw error;
  } finally {
    runtime.currentObserver_ = previousObserver;
    syncQueue_.flags_ &= ~Flags.Running;
    if (mode & Flags.QueueAsync) {
      asyncQueue_.flags_ &= ~Flags.Running;
    }
  }
}

function flushAsyncQueue(): void {
  flushEffects(Flags.QueueAsync);
}

function getSource(value: ReadableLike): Source;
function getSource(value: unknown): Source | undefined;
function getSource(value: unknown): Source | undefined {
  if (isReadable(value) || isReadable((value = (value as ReadableProvider | undefined)?.$))) {
    return value as Source;
  }
}

function addStaticDependencies(observer: ComputedNode, sources: ReadableLike | readonly ReadableLike[]): void {
  const source = getSource(sources);
  if (source !== undefined) {
    addStaticDependency(source, observer);
  } else {
    for (const input of sources as readonly ReadableLike[]) {
      addStaticDependency(getSource(input), observer);
    }
  }
}

function addStaticDependency(source: Source, observer: ComputedNode): void {
  const link = new Link(source, observer);
  appendDep(observer, link);
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

export interface ReadableProvider<T = any> {
  readonly $: Readable<T>;
}

export type ReadableLike<T = any> = Readable<T> | ReadableProvider<T>;

export type WritableOptions<T> = ValueOptions<T>;
export type ReadableOptions<T> = ValueOptions<T>;

export type ReadableValue<T> = T extends Readable<infer V> ? V : T extends ReadableProvider<infer V> ? V : never;
export type ReadableValues<T extends readonly ReadableLike[]> = {
  [K in keyof T]: ReadableValue<T[K]>;
};

export function isReadable<T>(value: Readable<T> | null | undefined): value is Readable<T>;
export function isReadable<T = any>(value: unknown): value is Readable<T>;
export function isReadable(value: unknown): value is Readable {
  return (value as Readable | undefined)?.[CONTRACT_SYMBOL] === CONTRACT_VERSION;
}

export function isWritable<T>(value: Readable<T> | null | undefined): value is Writable<T>;
export function isWritable<T = any>(value: unknown): value is Writable<T>;
export function isWritable(value: unknown): value is Writable {
  return isReadable(value) && ((value as Writable).set || NOOP_) !== NOOP_;
}

export function isReadableProvider<T>(value: ReadableProvider<T> | null | undefined): value is ReadableProvider<T>;
export function isReadableProvider<T = any>(value: unknown): value is ReadableProvider<T>;
export function isReadableProvider(value: unknown): value is ReadableProvider {
  return isReadable((value as ReadableProvider | undefined)?.$);
}

export function isReadableLike<T>(value: ReadableLike<T> | null | undefined): value is ReadableLike<T>;
export function isReadableLike<T = any>(value: unknown): value is ReadableLike<T>;
export function isReadableLike(value: unknown): value is ReadableLike {
  return isReadable(value) || isReadableProvider(value);
}

export function writable<T = any>(value: T, config?: WritableOptions<T>): Owned<Writable<T>> {
  return new ValueNode(value, config);
}

export function readable<T = any>(value: T, config?: ReadableOptions<T>): [Owned<Readable<T>>, Setter<T>] {
  const v = writable(value, config);
  const result: [Owned<Readable<T>>, Setter<T>] = [v, v.set];
  v.set = NOOP_;
  return result;
}

/**
 * Computes lazily and tracks its inputs. Computations and equality callbacks are
 * read-only. A detached node recomputes on its next read. Failed computations are
 * not repaired automatically; dispose and recreate the affected graph.
 */
export function computed<T>(compute: () => T, options?: ReadableOptions<T>): Owned<Readable<T>> {
  return new ComputedNode(compute, options);
}

/** Creates a lazy computed node with explicitly declared dependencies. */
export function derived<T, R>(
  source: ReadableLike<T>,
  compute: (value: T) => R,
  options?: ReadableOptions<R>,
): Owned<Readable<R>>;
export function derived<const T extends readonly ReadableLike[], R>(
  sources: T,
  compute: (...values: ReadableValues<T>) => R,
  options?: ReadableOptions<R>,
): Owned<Readable<R>>;
export function derived<R>(
  sources: ReadableLike | readonly ReadableLike[],
  compute: (...values: any[]) => R,
  options?: ReadableOptions<R>,
): Owned<Readable<R>> {
  const node = new ComputedNode(compute, options);
  node.flags_ |= Flags.DepsStatic;
  try {
    addStaticDependencies(node, sources);
  } catch (error) {
    node.dispose();
    throw error;
  }
  return node;
}

function createSubscription(source: Source, callback: Subscriber, options?: SubscribeOptions): Cleanup {
  const previousObserver = runtime.currentObserver_;
  runtime.currentObserver_ = null;
  let subscription: Subscription | undefined;
  try {
    batch(() => {
      const value = readSource(source);
      const mode = options?.sync ? Flags.None : Flags.QueueAsync;
      let list = mode & Flags.QueueAsync ? source.asyncSubscriptions_ : source.syncSubscriptions_;
      if (list === null) {
        list = new SubscriptionList(source, mode, value);
        if (!(source.flags_ & Flags.Disposed)) {
          source.flags_ |= Flags.HasSubscriptions;
          if (!(mode & Flags.QueueAsync)) {
            source.syncSubscriptions_ = list;
          } else {
            source.asyncSubscriptions_ = list;
          }
        }
      } else if (source.flags_ & (mode & Flags.QueueAsync ? Flags.QueuedAsyncSource : Flags.QueuedSyncSource)) {
        // A joining subscriber may have consumed a different value. The next
        // source broadcast includes everyone, rather than retaining per-listener history.
        list.flags_ |= Flags.ForceNotify;
      }
      subscription = new Subscription(list, callback);
      appendSub(list, subscription);
      if (options?.immediate !== false) {
        callback.call(subscription, value);
      }
    });
  } catch (error) {
    subscription?.dispose();
    throw error;
  } finally {
    runtime.currentObserver_ = previousObserver;
  }
  return subscription!.dispose;
}

function broadcastSource(source: Source, mode: Flags): void {
  const list = mode & Flags.QueueAsync ? source.asyncSubscriptions_ : source.syncSubscriptions_;
  if (list === null) {
    return;
  }
  const value = readSource(source);
  const flags = list.flags_;
  list.flags_ = flags & ~(Flags.Dirty | Flags.ForceNotify);
  const equal = source.equal_;
  const changed =
    flags & Flags.ForceNotify ||
    (flags & Flags.Dirty &&
      (equal === null ? list.value_ !== value : equal === false || different(equal, list.value_, value)));
  list.value_ = value;
  if (changed) {
    list.next_ = list.subHead_;
    list.end_ = list.subTail_;
    try {
      while (list.next_ !== null) {
        const subscription = list.next_;
        list.next_ = subscription.subNext_;
        subscription.callback_(value);
        if (subscription === list.end_) {
          break;
        }
      }
    } finally {
      list.next_ = null;
      list.end_ = null;
    }
  }
}

function disposeSubscriptions(source: Source): void {
  for (const list of [source.syncSubscriptions_, source.asyncSubscriptions_]) {
    while (list !== null && list.subHead_ !== null) {
      list.subHead_.dispose();
    }
  }
}

export interface WatchOptions {
  sync?: boolean;
}

/**
 * Runs immediately, then in synchronous batches or asynchronous microtasks.
 * Effects check their latest inputs at their turn; reads remain live.
 * Effects compare inputs with their own last consumption and skip
 * both the callback and cleanup when all published inputs have reverted.
 * A thrown error aborts the current queue. Dispose affected effects and computed
 * nodes before rebuilding a failed graph.
 */
export function watch(effect: WatchEffect, options?: WatchOptions): Cleanup {
  const node = new WatchNode(effect, options?.sync ? Flags.None : Flags.QueueAsync);
  try {
    batch(() => {
      const previousObserver = runtime.currentObserver_;
      runtime.currentObserver_ = node;
      node.flags_ |= Flags.Running;
      try {
        node.cleanup_ = node.callback_() || null;
      } finally {
        runtime.currentObserver_ = previousObserver;
        node.flags_ &= ~Flags.Running;
        if (node.flags_ & Flags.Disposed) {
          disposeEffect(node);
        }
      }
    });
  } catch (error) {
    node.dispose();
    throw error;
  }
  return node.dispose;
}

export function batch<T>(fn: () => T): T {
  const outer = !(syncQueue_.flags_ & Flags.Running);
  if (outer) {
    syncQueue_.flags_ |= Flags.Running;
  }
  try {
    const result = fn();
    if (outer && syncQueue_.head_ < syncQueue_.tail_) {
      flushEffects();
    }
    return result;
  } catch (error) {
    if (outer) {
      clearQueue(syncQueue_);
      clearQueue(asyncQueue_);
    }
    throw error;
  } finally {
    if (outer) {
      syncQueue_.flags_ &= ~Flags.Running;
    }
  }
}
