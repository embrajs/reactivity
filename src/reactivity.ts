import {
  appendSub,
  clearSubs,
  type IDepItem,
  type IDepList,
  type ISubItem,
  type ISubList,
  removeSub,
} from "./broadcast";
import { CONTRACT_SYMBOL, CONTRACT_VERSION, Flags } from "./constants";
import type { Cleanup, Equality, EqualityConfig, NormalizedEquality, Owned, Setter } from "./types";

declare global {
  interface EmbraReactivityTypeSymbols {
    readonly CONTRACT: unique symbol;
  }
  interface EmbraReactivityGlobals {
    [CONTRACT_SYMBOL]?: EmbraReactivityRuntimes;
  }
  interface EmbraReactivityRuntimes {
    [CONTRACT_VERSION]?: Runtime;
  }
}

interface RuntimeQueue {
  /** Running while a batch/flush is active, or an asynchronous flush is scheduled. */
  flags_: Flags;
  items_: (QueueItem | undefined)[];
  head_: number;
  tail_: number;
}

interface Runtime {
  NOOP_: () => void;
  currentObserver_: Observer | null;
  syncQueue_: RuntimeQueue;
  asyncQueue_: RuntimeQueue;
  /** Development-only write guard; omitted from production evaluation. */
  __dev_currentComputation?: unknown;
}

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

const runtime = (((globalThis as EmbraReactivityGlobals)[CONTRACT_SYMBOL] ??= {})[CONTRACT_VERSION] ??= {
  NOOP_() {},
  currentObserver_: null,
  syncQueue_: { flags_: Flags.None, items_: [], head_: 0, tail_: 0 },
  asyncQueue_: { flags_: Flags.None, items_: [], head_: 0, tail_: 0 },
});
const { NOOP_, syncQueue_, asyncQueue_ } = runtime;

interface Link extends ISubItem, IDepItem {
  // Watch links use Dirty for a publication and Pending for two or more.
  flags_: Flags;
  subNext_: Link | null;
  subPrev_: Link | null;
  depNext_: Link | null;
  source_: Source;
  observer_: Observer;
  // Only Watch inputs retain a consumed value; Computed inputs leave this null.
  value_: any;
}

function createLink(source: Source, observer: Observer): Link {
  return {
    flags_: Flags.None,
    subNext_: null,
    subPrev_: null,
    depNext_: null,
    source_: source,
    observer_: observer,
    value_: null,
  };
}

interface ValueOptions<T> {
  name?: string;
  equal?: EqualityConfig<T>;
}

declare class ValueNode<T = any> implements ISubList, Writable<T> {
  runtime_: Runtime;
  // Keep the shared Source fields in the same construction order as ComputedNode.
  flags_: Flags;
  subHead_: Link | null;
  subTail_: Link | null;
  [CONTRACT_SYMBOL]: CONTRACT_VERSION;
  name: string;
  value_: T;
  equal_: NormalizedEquality<T>;
  syncSubscriptions_: SubscriptionList | null;
  asyncSubscriptions_: SubscriptionList | null;
  __dev_disposed_at: Error | null;
  value: T;
  get: () => T;
  set: Setter<T>;
  dispose(): void;
  subscribe(callback: Subscriber, options?: SubscribeOptions): Cleanup;
  constructor(value: T, options?: ValueOptions<T>);
}

function ValueNode<T>(this: ValueNode<T>, value: T, options?: ValueOptions<T>) {
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

  this.get = () => {
    const observer = this.runtime_.currentObserver_;
    if (observer !== null && !(this.flags_ & Flags.Disposed)) {
      this.flags_ &= ~(Flags.Dirty | Flags.WatchSingleWrite);
      trackDependency(this, observer);
    }
    return this.value_;
  };

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
        } else if (this.flags_ & Flags.WatchSingleWrite) {
          markRepeatedWatchWrites(this);
        }
        if (!(this.runtime_.syncQueue_.flags_ & Flags.Running)) {
          flushEffects(Flags.None);
        }
      }
    }
  };
}

declare class ComputedNode<T = any> implements ISubList, IDepList, Readable<T> {
  runtime_: Runtime;
  // Keep the shared Source fields in the same construction order as ValueNode.
  flags_: Flags;
  subHead_: Link | null;
  subTail_: Link | null;
  [CONTRACT_SYMBOL]: CONTRACT_VERSION;
  name: string;
  value_: T | undefined;
  value: T;
  equal_: NormalizedEquality<T>;
  syncSubscriptions_: SubscriptionList | null;
  asyncSubscriptions_: SubscriptionList | null;
  __dev_disposed_at: Error | null;
  get: () => T;
  set: (value: T) => void;
  depHead_: Link | null;
  // The confirmed tail during collection; the actual tail outside collection.
  depTail_: Link | null;
  compute_: ((...values: any[]) => T) | null;
  dispose(): void;
  subscribe(callback: Subscriber, options?: SubscribeOptions): Cleanup;
  constructor(compute: (...values: any[]) => T, options?: ReadableOptions<T>);
}

function ComputedNode<T>(this: ComputedNode<T>, compute: (...values: any[]) => T, options?: ReadableOptions<T>) {
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
  this.get = () => {
    if (this.flags_ & (Flags.Dirty | Flags.Pending | Flags.Running)) {
      updateComputed(this);
    }
    const observer = this.runtime_.currentObserver_;
    if (observer !== null && !(this.flags_ & Flags.Disposed)) {
      trackDependency(this, observer);
    }
    return this.value_ as T;
  };
  this.depHead_ = null;
  this.depTail_ = null;
  this.compute_ = compute;
}

ValueNode.prototype = ComputedNode.prototype = {
  runtime_: runtime,

  get value(): any {
    return this.get();
  },

  set value(value: any) {
    this.set(value);
  },

  set: NOOP_,

  subscribe(callback: Subscriber, options?: SubscribeOptions): Cleanup {
    const previousObserver = this.runtime_.currentObserver_;
    this.runtime_.currentObserver_ = null;
    let subscription: Subscription | undefined;
    try {
      batch(() => {
        const value = readSource(this);
        const mode = options?.sync ? Flags.None : Flags.QueueModeAsync;
        let list = mode & Flags.QueueModeAsync ? this.asyncSubscriptions_ : this.syncSubscriptions_;
        if (list === null) {
          list = {
            flags_: mode,
            subHead_: null,
            subTail_: null,
            value_: value,
            source_: this,
            next_: null,
            end_: null,
          };
          if (!(this.flags_ & Flags.Disposed)) {
            this.flags_ |= Flags.HasSubscriptions;
            if (!(mode & Flags.QueueModeAsync)) {
              this.syncSubscriptions_ = list;
            } else {
              this.asyncSubscriptions_ = list;
            }
          }
        } else if (this.flags_ & (mode & Flags.QueueModeAsync ? Flags.QueuedAsyncSource : Flags.QueuedSyncSource)) {
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
      this.runtime_.currentObserver_ = previousObserver;
    }
    return subscription!.dispose;
  },

  dispose(): void {
    if (!(this.flags_ & Flags.Disposed)) {
      const kind = this.flags_ & Flags.KindMask;
      this.flags_ = kind | Flags.Disposed;

      if (process.env.NODE_ENV !== "production") {
        this.__dev_disposed_at = new Error();
      }

      if (kind === Flags.KindComputedNode) {
        (this as ComputedNode).depTail_ = null;
        trimDependencies(this as ComputedNode);
        (this as ComputedNode).compute_ = null;
      }

      clearSubs(this);

      while (this.syncSubscriptions_ !== null) {
        this.syncSubscriptions_.subHead_!.dispose();
      }
      while (this.asyncSubscriptions_ !== null) {
        this.asyncSubscriptions_.subHead_!.dispose();
      }
    }
  },
} satisfies ThisType<ValueNode | ComputedNode> as any;

// Subscriptions are source-owned records, not graph observers or queue entries.
interface SubscriptionList extends ISubList {
  flags_: Flags;
  subHead_: Subscription | null;
  subTail_: Subscription | null;
  value_: any;
  source_: Source;
  next_: Subscription | null;
  end_: Subscription | null;
}

declare class Subscription implements EffectContext {
  list_: SubscriptionList | null;
  callback_: Subscriber;
  subNext_: Subscription | null;
  subPrev_: Subscription | null;
  dispose: Cleanup;
  constructor(list: SubscriptionList | null, callback: Subscriber);
}

function Subscription(this: Subscription, list: SubscriptionList | null, callback: Subscriber) {
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
        if (!(list.flags_ & Flags.QueueModeAsync)) {
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

declare class WatchNode implements IDepList, EffectContext {
  flags_: Flags;
  depHead_: Link | null;
  depTail_: Link | null;
  cleanup_: Cleanup | null;
  callback_: (this: EffectContext) => void | Cleanup;
  dispose: Cleanup;
  constructor(callback: WatchEffect, flags: Flags);
}

function WatchNode(this: WatchNode, callback: WatchEffect, flags: Flags) {
  this.flags_ = Flags.KindSubscriberNode | Flags.Connected | flags;
  this.depHead_ = null;
  this.depTail_ = null;
  this.cleanup_ = null;
  this.callback_ = callback;

  this.dispose = (): void => {
    if (!(this.flags_ & Flags.Disposed)) {
      this.flags_ |= Flags.Disposed;
      if (!(this.flags_ & Flags.Running)) {
        finalizeEffectDisposal(this);
      }
    }
  };
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

function trackDependency(source: Source, observer: Observer): void {
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
    link = createLink(source, observer);
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
  if ((observer.flags_ & Flags.KindMask) === Flags.KindSubscriberNode) {
    link.value_ = source.value_;
  }
}

function trimDependencies(observer: Observer): void {
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
  const queued = mode & Flags.QueueModeAsync ? Flags.QueuedAsyncSource : Flags.QueuedSyncSource;
  if (!(source.flags_ & queued)) {
    source.flags_ |= queued;
    const queue = mode & Flags.QueueModeAsync ? asyncQueue_ : syncQueue_;
    queue.items_[queue.tail_++] = source;
    if (mode & Flags.QueueModeAsync && !(queue.flags_ & Flags.Running)) {
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
      queueSource(source, Flags.QueueModeAsync);
    }
  }
}

function enqueueWatch(observer: WatchNode, flags: Flags): void {
  if (!(flags & (Flags.Disposed | Flags.QueuedSyncSource))) {
    observer.flags_ = flags | Flags.QueuedSyncSource;
    const queue = flags & Flags.QueueModeAsync ? asyncQueue_ : syncQueue_;
    queue.items_[queue.tail_++] = observer;
    if (queue === asyncQueue_ && !(queue.flags_ & Flags.Running)) {
      queue.flags_ |= Flags.Running;
      queueMicrotask(flushAsyncQueue);
    }
  }
}

// A write confirms direct inputs. Descendants only need upstream validation.
function propagate(source: ValueNode): void {
  queueSubscriptions(source, Flags.Dirty);
  let hasSingleWrite = false;
  for (let link = source.subHead_; link !== null; link = link.subNext_) {
    const observer = link.observer_;
    const flags = observer.flags_;
    if ((flags & Flags.KindMask) === Flags.KindComputedNode) {
      observer.flags_ = flags | Flags.Pending | Flags.Dirty;
      if (!(flags & Flags.Pending)) {
        propagatePending(observer as ComputedNode);
      }
    } else {
      if (link.flags_ & Flags.Dirty) {
        link.flags_ |= Flags.Pending;
      } else {
        link.flags_ |= Flags.Dirty;
        hasSingleWrite = true;
      }
      enqueueWatch(observer as WatchNode, flags);
    }
  }
  if (hasSingleWrite) {
    source.flags_ |= Flags.WatchSingleWrite;
  }
}

function markRepeatedWatchWrites(source: ValueNode): void {
  // The first write already queued these Watches. A tracked read clears the
  // Value latch before adding or resetting a Watch link.
  source.flags_ &= ~Flags.WatchSingleWrite;
  for (let link = source.subHead_; link !== null; link = link.subNext_) {
    if (link.flags_ & Flags.Dirty) {
      link.flags_ |= Flags.Pending;
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
      source.flags_ &= ~(Flags.Dirty | Flags.WatchSingleWrite);
    }
  }
  return source.value_;
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
      if (node.flags_ & Flags.HasSubscriptions) {
        if (node.syncSubscriptions_ !== null) {
          node.syncSubscriptions_.flags_ |= Flags.Dirty;
        }
        if (node.asyncSubscriptions_ !== null) {
          node.asyncSubscriptions_.flags_ |= Flags.Dirty;
        }
      }
      for (let link = node.subHead_; link !== null; link = link.subNext_) {
        if ((link.observer_.flags_ & Flags.KindMask) === Flags.KindComputedNode) {
          link.observer_.flags_ |= Flags.Dirty;
        } else {
          link.flags_ |= link.flags_ & Flags.Dirty ? Flags.Pending : Flags.Dirty;
          enqueueWatch(link.observer_ as WatchNode, link.observer_.flags_);
        }
      }
    }
  } finally {
    node.flags_ = (node.flags_ | Flags.Initialized) & ~(Flags.Dirty | Flags.Pending | Flags.Running);
    runtime.currentObserver_ = previousObserver;
    if (dynamic) {
      trimDependencies(node);
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

function runEffectCleanup(effect: WatchNode): void {
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

function finalizeEffectDisposal(effect: WatchNode): void {
  effect.flags_ &= ~Flags.Connected;
  effect.depTail_ = null;
  trimDependencies(effect);
  effect.callback_ = NOOP_;
  runEffectCleanup(effect);
}

function runEffect(effect: WatchNode): void {
  const previousObserver = runtime.currentObserver_;
  runtime.currentObserver_ = null;
  effect.flags_ |= Flags.Running;
  try {
    runEffectCleanup(effect);
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
      finalizeEffectDisposal(effect);
    } else {
      trimDependencies(effect);
    }
  }
}

function hasEffectChange(effect: WatchNode): boolean {
  for (let link = effect.depHead_; link !== null; link = link.depNext_) {
    const source = link.source_;
    if (!(source.flags_ & Flags.Disposed)) {
      readSource(source);
      if (link.flags_ & Flags.Dirty) {
        if (!(link.flags_ & Flags.Pending)) {
          return true;
        }
        const equal = source.equal_;
        if (
          equal === null
            ? link.value_ !== source.value_
            : equal === false || different(equal, link.value_, source.value_)
        ) {
          return true;
        }
        link.flags_ &= ~(Flags.Dirty | Flags.Pending);
        link.value_ = source.value_;
      }
    }
  }
  return false;
}

function clearQueue(queue: RuntimeQueue): void {
  for (let i = queue.head_; i < queue.tail_; i++) {
    const item = queue.items_[i];
    if (item !== undefined) {
      item.flags_ &= ~(Flags.QueuedSyncSource | Flags.QueuedAsyncSource);
      queue.items_[i] = undefined;
    }
  }
  queue.head_ = queue.tail_ = 0;
}

function flushEffects(mode: Flags): void {
  const previousObserver = runtime.currentObserver_;
  runtime.currentObserver_ = null;
  syncQueue_.flags_ |= Flags.Running;
  try {
    while (
      syncQueue_.head_ < syncQueue_.tail_ ||
      (mode & Flags.QueueModeAsync && asyncQueue_.head_ < asyncQueue_.tail_)
    ) {
      const queue = syncQueue_.head_ < syncQueue_.tail_ ? syncQueue_ : asyncQueue_;
      const isAsync = queue === asyncQueue_;
      // Finish the current async wave, then drain sync writes before the next wave.
      const limit = isAsync ? queue.tail_ : 0;
      let i = queue.head_;
      for (; i < (isAsync ? limit : queue.tail_); i++) {
        const item = queue.items_[i]!;
        queue.items_[i] = undefined;
        if ((item.flags_ & Flags.KindMask) === Flags.KindSubscriberNode) {
          item.flags_ &= ~Flags.QueuedSyncSource;
          if (!(item.flags_ & Flags.Disposed) && hasEffectChange(item as WatchNode)) {
            runEffect(item as WatchNode);
          }
        } else {
          item.flags_ &= ~(isAsync ? Flags.QueuedAsyncSource : Flags.QueuedSyncSource);
          if (!(item.flags_ & Flags.Disposed)) {
            const source = item as Source;
            const list = isAsync ? source.asyncSubscriptions_ : source.syncSubscriptions_;
            if (list !== null) {
              broadcastSource(source, list);
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
    if (mode & Flags.QueueModeAsync) {
      asyncQueue_.flags_ &= ~Flags.Running;
    }
  }
}

function flushAsyncQueue(): void {
  flushEffects(Flags.QueueModeAsync);
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

export type WritableOptions<T> = ValueOptions<T>;
export type ReadableOptions<T> = ValueOptions<T>;

export type ReadableValue<T> = T extends Readable<infer V> ? V : never;
export type ReadableValues<T extends readonly Readable[]> = {
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

/**
 * Creates a lazy computed node with explicitly declared Readable dependencies.
 * Unwrap providers with `provider.$` before passing them as dependencies.
 */
export function derived<T, R>(
  source: Readable<T>,
  compute: (value: T) => R,
  options?: ReadableOptions<R>,
): Owned<Readable<R>>;
export function derived<const T extends readonly Readable[], R>(
  sources: T,
  compute: (...values: ReadableValues<T>) => R,
  options?: ReadableOptions<R>,
): Owned<Readable<R>>;
export function derived<R>(
  sources: Readable | readonly Readable[],
  compute: (...values: any[]) => R,
  options?: ReadableOptions<R>,
): Owned<Readable<R>> {
  const computed = new ComputedNode(compute, options);
  computed.flags_ |= Flags.DepsStatic;
  if (isReadable(sources)) {
    computed.depHead_ = computed.depTail_ = createLink(sources as Source, computed);
  } else {
    for (const source of sources) {
      const link = createLink(source as Source, computed);
      if (computed.depTail_ !== null) {
        computed.depTail_.depNext_ = link;
      } else {
        computed.depHead_ = link;
      }
      computed.depTail_ = link;
    }
  }
  return computed;
}

function broadcastSource(source: Source, list: SubscriptionList): void {
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

export interface WatchOptions {
  sync?: boolean;
}

/**
 * Runs immediately, then in synchronous batches or asynchronous microtasks.
 * Effects check their latest inputs at their turn; reads remain live.
 * A single publication reruns the effect without comparing its input again.
 * When multiple publications occur, the effect compares the latest value with
 * its observed value and skips the callback and cleanup if its inputs are equal.
 * A thrown error aborts the current queue. Dispose affected effects and computed
 * nodes before rebuilding a failed graph.
 */
export function watch(effect: WatchEffect, options?: WatchOptions): Cleanup {
  const node = new WatchNode(effect, options?.sync ? Flags.None : Flags.QueueModeAsync);
  try {
    batch(() => runEffect(node));
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
      flushEffects(Flags.None);
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
