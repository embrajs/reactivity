import {
  appendSub,
  clearSubs,
  detachCallback,
  type ICallbackItem,
  type ICallbackList,
  type IDepItem,
  type IDepList,
  type ISubItem,
  type ISubList,
  invokeCallbacks,
  removeSub,
} from "./broadcast";
import { CONTRACT_SYMBOL, CONTRACT_VERSION, Flags } from "./constants";
import { asyncQueue_, clearQueue, NOOP_, type Runtime, runtime, syncQueue_ } from "./runtime";
import type {
  Cleanup,
  EffectContext,
  Equality,
  NormalizedEquality,
  Readable,
  ReadableOptions,
  Setter,
  SubscribeOptions,
  Subscriber,
  WatchEffect,
  Writable,
} from "./types";

export type Source<T = any> = ValueNode<T> | ComputedNode<T>;
export type Observer = ComputedNode | WatchNode;

/**
 * Groups multiple writes into a single synchronous notification flush at the end
 * of the outermost batch. Nested batches defer flushing until the outer batch
 * completes. A thrown error aborts the batch and discards pending notifications.
 *
 * @category Effects & Scheduling
 */
export function batch<T>(fn: () => T): T {
  const outer = !(syncQueue_.flags_ & Flags.Running);
  if (outer) {
    syncQueue_.flags_ |= Flags.Running;
    if (__DEV__) {
      runtime.__dev_spy?.({ type: "batch-start" });
    }
  }
  try {
    const result = fn();
    if (outer && syncQueue_.head_ < syncQueue_.tail_) {
      flushEffects(Flags.None);
    }
    if (__DEV__) {
      if (outer) {
        runtime.__dev_spy?.({ type: "batch-end" });
      }
    }
    return result;
  } catch (error) {
    if (__DEV__) {
      if (outer) {
        runtime.__dev_spy?.({ type: "batch-end", error });
      }
    }
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
  __dev_disposed_at?: Error;
  value: T;
  get: () => T;
  set: Setter<T>;
  dispose(): void;
  [Symbol.dispose](): void;
  subscribe(callback: Subscriber, options?: SubscribeOptions): Cleanup;
  toJSON(key?: string): unknown;
  toString(): string;
  valueOf(): T;
  constructor(value: T, options?: ReadableOptions<T>);
}

function ValueNode<T>(this: ValueNode<T>, value: T, options?: ReadableOptions<T>) {
  this.flags_ = Flags.KindValueNode;
  this.subHead_ = null;
  this.subTail_ = null;
  this[CONTRACT_SYMBOL] = CONTRACT_VERSION;
  this.name = options?.name ?? "";
  this.value_ = value;
  this.equal_ = options?.equal ?? null;
  this.syncSubscriptions_ = null;
  this.asyncSubscriptions_ = null;

  this.get = () => {
    const observer = this.runtime_.currentObserver_;
    if (observer !== null && !(this.flags_ & Flags.Disposed)) {
      this.flags_ &= ~(Flags.Dirty | Flags.WatchSingleWrite);
      trackDependency(this, observer);
    }
    return this.value_;
  };

  this.set = (value) => {
    if (__DEV__) {
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
      if (__DEV__) {
        const prevValue = this.value_;
        this.value_ = value;
        runtime.__dev_spy?.({ type: "set", node: this, prevValue, nextValue: value, changed: true });
      } else {
        this.value_ = value;
      }
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
    } else {
      if (__DEV__) {
        runtime.__dev_spy?.({ type: "set", node: this, prevValue: this.value_, nextValue: value, changed: false });
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
  __dev_disposed_at?: Error;
  get: () => T;
  set: (value: T) => void;
  depHead_: Link | null;
  // The confirmed tail during collection; the actual tail outside collection.
  depTail_: Link | null;
  compute_: ((...values: any[]) => T) | null;
  dispose(): void;
  [Symbol.dispose](): void;
  subscribe(callback: Subscriber, options?: SubscribeOptions): Cleanup;
  toJSON(key?: string): unknown;
  toString(): string;
  valueOf(): T;
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

  toJSON(key?: string): unknown {
    const value = this.get() as { toJSON?: (key?: string) => unknown } | null | undefined;
    return value?.toJSON ? value.toJSON(key) : value;
  },

  toString(): string {
    return String(this.get());
  },

  valueOf(): any {
    return this.get();
  },

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

      if (__DEV__) {
        this.__dev_disposed_at = new Error();
        runtime.__dev_spy?.({ type: "dispose", node: this });
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

  [Symbol.dispose](): void {
    this.dispose();
  },
} satisfies ThisType<ValueNode | ComputedNode> as any;

// Subscriptions are source-owned records, not graph observers or queue entries.
interface SubscriptionList extends ICallbackList<Subscription> {
  flags_: Flags;
  subHead_: Subscription | null;
  subTail_: Subscription | null;
  value_: any;
  source_: Source;
  next_: Subscription | null;
  end_: Subscription | null;
}

declare class Subscription implements ICallbackItem<SubscriptionList>, EffectContext {
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
    const list = detachCallback(this);
    if (list !== null) {
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
      if (__DEV__) {
        runtime.__dev_spy?.({ type: "dispose", node: this });
      }
      if (!(this.flags_ & Flags.Running)) {
        finalizeEffectDisposal(this);
      }
    }
  };
}

function different(equal: Equality, previous: any, next: any): boolean {
  const previousObserver = runtime.currentObserver_;
  runtime.currentObserver_ = null;
  if (__DEV__) {
    runtime.__dev_currentComputation = (runtime.__dev_currentComputation! | 0) + 1;
  }
  try {
    return !equal(previous, next);
  } finally {
    runtime.currentObserver_ = previousObserver;
    if (__DEV__) {
      runtime.__dev_currentComputation!--;
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
    node.depHead_ = node.depTail_ = null;
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
    appendSub(source, link);
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
  if (source.flags_ & Flags.HasSubscriptions) {
    queueSubscriptions(source, Flags.Dirty);
  }
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
  top: while (true) {
    if (source.flags_ & Flags.HasSubscriptions) {
      queueSubscriptions(source, Flags.None);
    }
    for (let link = source.subHead_; link !== null; link = link.subNext_) {
      const observer = link.observer_;
      const flags = observer.flags_;
      if ((flags & Flags.KindMask) === Flags.KindComputedNode) {
        observer.flags_ = flags | Flags.Pending;
        if (!(flags & Flags.Pending)) {
          if (link.subNext_ === null) {
            source = observer as ComputedNode;
            continue top;
          }
          propagatePending(observer as ComputedNode);
        }
      } else if (!(flags & Flags.Disposed)) {
        queueSource(source, flags);
      }
    }
    return;
  }
}

export function readSource(source: Source): any {
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
  const previousObserver = runtime.currentObserver_;
  const track = !(node.flags_ & Flags.DepsStatic) || node.depHead_ === null;
  node.flags_ |= Flags.Running | Flags.Connected;
  if (__DEV__) {
    runtime.__dev_currentComputation = (runtime.__dev_currentComputation! | 0) + 1;
    runtime.__dev_spy?.({ type: "compute-start", node });
  }
  try {
    if (track) {
      node.flags_ ^= Flags.TrackPhase;
      node.depTail_ = null;
      runtime.currentObserver_ = node;
    } else {
      runtime.currentObserver_ = null;
    }
    const value = node.compute_!();
    // different() owns tracking isolation for custom equality callbacks.
    const equal = node.equal_;
    if (
      equal === null
        ? node.value_ !== value
        : equal === false || !(node.flags_ & Flags.Initialized) || different(equal, node.value_, value)
    ) {
      node.value_ = value;
      if (__DEV__) {
        runtime.__dev_spy?.({ type: "compute-end", node, nextValue: value, changed: true });
      }
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
    } else {
      if (__DEV__) {
        runtime.__dev_spy?.({ type: "compute-end", node, nextValue: node.value_, changed: false });
      }
    }
  } catch (error) {
    if (__DEV__) {
      runtime.__dev_spy?.({ type: "compute-end", node, nextValue: node.value_, changed: false, error });
    }
    throw error;
  } finally {
    node.flags_ = (node.flags_ | Flags.Initialized) & ~(Flags.Dirty | Flags.Pending | Flags.Running);
    runtime.currentObserver_ = previousObserver;
    if (track) {
      trimDependencies(node);
    }
    if (__DEV__) {
      runtime.__dev_currentComputation!--;
    }
  }
}

function runEffectCleanup(effect: WatchNode): void {
  const cleanup = effect.cleanup_;
  if (cleanup !== null) {
    effect.cleanup_ = null;
    untrack(cleanup);
  }
}

function finalizeEffectDisposal(effect: WatchNode): void {
  effect.flags_ &= ~Flags.Connected;
  effect.depTail_ = null;
  trimDependencies(effect);
  effect.callback_ = NOOP_;
  runEffectCleanup(effect);
}

export function runEffect(effect: WatchNode): void {
  const previousObserver = runtime.currentObserver_;
  runtime.currentObserver_ = null;
  effect.flags_ |= Flags.Running;
  if (__DEV__) {
    runtime.__dev_spy?.({ type: "effect-start", node: effect });
  }
  try {
    runEffectCleanup(effect);
    if (!(effect.flags_ & Flags.Disposed)) {
      effect.flags_ ^= Flags.TrackPhase;
      effect.depTail_ = null;
      runtime.currentObserver_ = effect;
      effect.cleanup_ = effect.callback_() || null;
    }
    if (__DEV__) {
      runtime.__dev_spy?.({ type: "effect-end", node: effect });
    }
  } catch (error) {
    if (__DEV__) {
      runtime.__dev_spy?.({ type: "effect-end", node: effect, error });
    }
    throw error;
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

function flushEffects(mode: Flags): void {
  const previousObserver = runtime.currentObserver_;
  const wasSyncRunning = syncQueue_.flags_ & Flags.Running;
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
      while (queue.head_ < (isAsync ? limit : queue.tail_) && queue.head_ < queue.tail_) {
        const i = queue.head_++;
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
      if (queue.head_ === queue.tail_) {
        queue.head_ = queue.tail_ = 0;
      }
    }
  } catch (error) {
    clearQueue(syncQueue_);
    clearQueue(asyncQueue_);
    throw error;
  } finally {
    runtime.currentObserver_ = previousObserver;
    if (!wasSyncRunning) {
      syncQueue_.flags_ &= ~Flags.Running;
    }
    if (mode & Flags.QueueModeAsync && asyncQueue_.head_ === asyncQueue_.tail_) {
      asyncQueue_.flags_ &= ~Flags.Running;
    }
  }
}

function flushAsyncQueue(): void {
  if (syncQueue_.head_ === syncQueue_.tail_ && asyncQueue_.head_ === asyncQueue_.tail_) {
    asyncQueue_.flags_ &= ~Flags.Running;
    return;
  }
  if (__DEV__) {
    runtime.__dev_spy?.({ type: "flush-start", async: true });
    try {
      flushEffects(Flags.QueueModeAsync);
      runtime.__dev_spy?.({ type: "flush-end", async: true });
    } catch (error) {
      runtime.__dev_spy?.({ type: "flush-end", async: true, error });
      throw error;
    }
  } else {
    flushEffects(Flags.QueueModeAsync);
  }
}

export function flush(): void {
  if (__DEV__) {
    if (runtime.__dev_currentComputation) {
      throw new Error("flush during computation");
    }
  }
  flushAsyncQueue();
}

export function untrack<T>(fn: () => T): T {
  const previousObserver = runtime.currentObserver_;
  runtime.currentObserver_ = null;
  try {
    return fn();
  } finally {
    runtime.currentObserver_ = previousObserver;
  }
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
    if (__DEV__) {
      if (runtime.__dev_spy) {
        let count = 0;
        for (let item = list.subHead_; item !== null; item = item.subNext_) {
          count++;
        }
        runtime.__dev_spy({
          type: "subscribe",
          node: source,
          value,
          sync: !(flags & Flags.QueueModeAsync),
          count,
        });
      }
    }
    invokeCallbacks(list, value);
  }
}

export { ComputedNode, ValueNode, WatchNode };
