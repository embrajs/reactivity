import {
  appendSub,
  clearSubs,
  type IDepItem,
  type IDepList,
  type ISubItem,
  type ISubList,
  removeSub,
} from "./broadcast";
import { CONTRACT_SYMBOL, CONTRACT_VERSION, LinkFlags, NodeFlags } from "./constants";
import { asyncQueue_, clearQueue, NOOP_, QueueFlags, type Runtime, runtime, syncQueue_ } from "./runtime";
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
  const outer = !(syncQueue_.flags_ & QueueFlags.Running);
  if (outer) {
    syncQueue_.flags_ |= QueueFlags.Running;
    if (__DEV__) {
      runtime.__dev_spy?.({ type: "batch-start" });
    }
  }
  try {
    const result = fn();
    if (outer && syncQueue_.head_ < syncQueue_.tail_) {
      flushEffects(NodeFlags.None);
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
      syncQueue_.flags_ &= ~QueueFlags.Running;
    }
  }
}

interface Link extends ISubItem, IDepItem {
  // Watch links use Published for a publication and PublishedMulti for two or more.
  flags_: LinkFlags;
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
    flags_: LinkFlags.None,
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
  flags_: NodeFlags;
  subHead_: Link | null;
  subTail_: Link | null;
  [CONTRACT_SYMBOL]: CONTRACT_VERSION;
  name: string;
  value_: T;
  equal_: NormalizedEquality<T>;
  __dev_disposed_at?: Error;
  value: T;
  get: () => T;
  peek(): T;
  set: Setter<T>;
  update(updater: (value: T) => T): void;
  dispose(): void;
  [Symbol.dispose](): void;
  subscribe(callback: Subscriber, options?: SubscribeOptions): Cleanup;
  toJSON(key?: string): unknown;
  toString(): string;
  valueOf(): T;
  constructor(value: T, options?: ReadableOptions<T>);
}

function ValueNode<T>(this: ValueNode<T>, value: T, options?: ReadableOptions<T>) {
  this.flags_ = NodeFlags.None;
  this.subHead_ = null;
  this.subTail_ = null;
  this[CONTRACT_SYMBOL] = CONTRACT_VERSION;
  this.name = options?.name ?? "";
  this.value_ = value;
  this.equal_ = options?.equal ?? null;

  this.get = () => {
    const observer = this.runtime_.currentObserver_;
    if (observer !== null && !(this.flags_ & NodeFlags.Disposed)) {
      this.flags_ &= ~(NodeFlags.Dirty | NodeFlags.WatchSingleWrite);
      trackDependency(this, observer);
    }
    return this.value_;
  };

  this.set = (value) => {
    if (__DEV__) {
      if (this.flags_ & NodeFlags.Disposed) {
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
      if (this.subHead_ !== null) {
        if (!(this.flags_ & NodeFlags.Dirty)) {
          this.flags_ |= NodeFlags.Dirty;
          propagate(this);
        } else if (this.flags_ & NodeFlags.WatchSingleWrite) {
          markRepeatedWatchWrites(this);
        }
        if (!(this.runtime_.syncQueue_.flags_ & QueueFlags.Running)) {
          flushEffects(NodeFlags.None);
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
  flags_: NodeFlags;
  subHead_: Link | null;
  subTail_: Link | null;
  [CONTRACT_SYMBOL]: CONTRACT_VERSION;
  name: string;
  value_: T | undefined;
  value: T;
  equal_: NormalizedEquality<T>;
  __dev_disposed_at?: Error;
  get: () => T;
  peek(): T;
  set: (value: T) => void;
  update(updater: (value: T) => T): void;
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
  this.flags_ = NodeFlags.KindComputedNode | NodeFlags.Dirty;
  this.subHead_ = null;
  this.subTail_ = null;
  this[CONTRACT_SYMBOL] = CONTRACT_VERSION;
  this.name = options?.name ?? "";
  this.value_ = undefined;
  this.equal_ = options?.equal ?? null;
  this.get = () => {
    if (this.flags_ & (NodeFlags.Dirty | NodeFlags.Pending | NodeFlags.Running)) {
      updateComputed(this);
    }
    const observer = this.runtime_.currentObserver_;
    if (observer !== null && !(this.flags_ & NodeFlags.Disposed)) {
      trackDependency(this, observer);
    }
    return this.value_ as T;
  };
  this.depHead_ = null;
  this.depTail_ = null;
  this.compute_ = compute;
}

(ValueNode as any).prototype = (ComputedNode as any).prototype = {
  runtime_: runtime,

  get value(): any {
    return this.get();
  },

  set value(value: any) {
    this.set(value);
  },

  set: NOOP_,

  peek(): any {
    if (
      this.flags_ & NodeFlags.KindComputedNode &&
      this.flags_ & (NodeFlags.Dirty | NodeFlags.Pending | NodeFlags.Running)
    ) {
      updateComputed(this as ComputedNode);
    }
    return this.value_;
  },

  update(updater: (value: any) => any): void {
    this.set(updater(this.value_));
  },

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
    const node = new WatchNode(
      callback as unknown as WatchEffect,
      (options?.sync ? NodeFlags.None : NodeFlags.QueueModeAsync) | NodeFlags.DepsStatic,
    );
    try {
      untrack(() =>
        batch(() => {
          const value = readSource(this);
          if (!(this.flags_ & NodeFlags.Disposed)) {
            const link = createLink(this, node);
            link.value_ = value;
            node.depHead_ = node.depTail_ = link;
            appendSub(this, link);
          }
          if (options?.immediate !== false) {
            node.flags_ |= NodeFlags.Running;
            try {
              node.callback_(value);
            } finally {
              node.flags_ &= ~NodeFlags.Running;
              if (node.flags_ & NodeFlags.Disposed) {
                finalizeEffectDisposal(node);
              }
            }
          }
          if (this.flags_ & NodeFlags.Disposed) {
            node.dispose();
          }
        }),
      );
    } catch (error) {
      node.dispose();
      throw error;
    }
    return node.dispose;
  },

  dispose(): void {
    if (!(this.flags_ & NodeFlags.Disposed)) {
      const isComputed = this.flags_ & NodeFlags.KindComputedNode;
      this.flags_ = isComputed | NodeFlags.Disposed;

      if (__DEV__) {
        this.__dev_disposed_at = new Error();
        runtime.__dev_spy?.({ type: "dispose", node: this });
      }

      if (isComputed) {
        (this as ComputedNode).depTail_ = null;
        trimDependencies(this as ComputedNode);
        (this as ComputedNode).compute_ = null;
      }

      clearSubs(this);
    }
  },

  [Symbol.dispose](): void {
    this.dispose();
  },
} satisfies ThisType<ValueNode | ComputedNode>;

declare class WatchNode implements IDepList, EffectContext {
  flags_: NodeFlags;
  depHead_: Link | null;
  depTail_: Link | null;
  cleanup_: Cleanup | null;
  callback_: (this: EffectContext, value?: any) => void | Cleanup;
  dispose: Cleanup;
  constructor(callback: WatchEffect, flags: NodeFlags);
}

function WatchNode(this: WatchNode, callback: WatchEffect, flags: NodeFlags) {
  this.flags_ = NodeFlags.KindSubscriberNode | NodeFlags.Connected | flags;
  this.depHead_ = null;
  this.depTail_ = null;
  this.cleanup_ = null;
  this.callback_ = callback;

  this.dispose = (): void => {
    if (!(this.flags_ & NodeFlags.Disposed)) {
      this.flags_ |= NodeFlags.Disposed;
      if (__DEV__) {
        if (!(this.flags_ & NodeFlags.DepsStatic)) {
          runtime.__dev_spy?.({ type: "dispose", node: this });
        }
      }
      if (!(this.flags_ & NodeFlags.Running)) {
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
    (flags & (NodeFlags.KindComputedNode | NodeFlags.Disposed)) === NodeFlags.KindComputedNode &&
    source.subHead_ === null
  ) {
    const node = source as ComputedNode;
    node.flags_ = (flags | NodeFlags.Dirty) & ~NodeFlags.Connected;
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
  const phase = observer.flags_ & NodeFlags.TrackPhase;
  let link = tail !== null ? tail.depNext_ : observer.depHead_;
  if (link === null || link.source_ !== source) {
    const last = source.subTail_;
    if (last !== null && last.observer_ === observer && (last.flags_ & LinkFlags.TrackPhase) === phase) {
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
  if (observer.flags_ & NodeFlags.KindSubscriberNode) {
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

function pushQueue(item: Source | WatchNode, flags: NodeFlags): void {
  const isAsync = !!(flags & NodeFlags.QueueModeAsync);
  const queue = isAsync ? asyncQueue_ : syncQueue_;
  queue.items_[queue.tail_++] = item;
  if (isAsync && !(queue.flags_ & QueueFlags.Running)) {
    queue.flags_ |= QueueFlags.Running;
    queueMicrotask(flushAsyncQueue);
  }
}

// A publication dirties direct consumers; descendants only need validation.
function queueSource(source: Source, mode: NodeFlags): void {
  const queued = mode & NodeFlags.QueueModeAsync ? NodeFlags.QueuedAsyncSource : NodeFlags.QueuedSyncSource;
  if (!(source.flags_ & queued)) {
    source.flags_ |= queued;
    pushQueue(source, mode);
  }
}

function enqueueWatch(observer: WatchNode, flags: NodeFlags): void {
  if (!(flags & (NodeFlags.Disposed | NodeFlags.QueuedSyncSource))) {
    observer.flags_ = flags | NodeFlags.QueuedSyncSource;
    pushQueue(observer, flags);
  }
}

// A write confirms direct inputs. Descendants only need upstream validation.
function propagate(source: ValueNode): void {
  let hasSingleWrite = false;
  for (let link = source.subHead_; link !== null; link = link.subNext_) {
    const observer = link.observer_;
    const flags = observer.flags_;
    if (flags & NodeFlags.KindComputedNode) {
      observer.flags_ = flags | NodeFlags.Pending | NodeFlags.Dirty;
      if (!(flags & NodeFlags.Pending)) {
        propagatePending(observer as ComputedNode);
      }
    } else {
      if (link.flags_ & LinkFlags.Published) {
        link.flags_ |= LinkFlags.PublishedMulti;
      } else {
        link.flags_ |= LinkFlags.Published;
        hasSingleWrite = true;
      }
      enqueueWatch(observer as WatchNode, flags);
    }
  }
  if (hasSingleWrite) {
    source.flags_ |= NodeFlags.WatchSingleWrite;
  }
}

function markRepeatedWatchWrites(source: ValueNode): void {
  // The first write already queued these Watches. A tracked read clears the
  // Value latch before adding or resetting a Watch link.
  source.flags_ &= ~NodeFlags.WatchSingleWrite;
  for (let link = source.subHead_; link !== null; link = link.subNext_) {
    if (link.flags_ & LinkFlags.Published) {
      link.flags_ |= LinkFlags.PublishedMulti;
    }
  }
}

function propagatePending(source: ComputedNode): void {
  top: while (true) {
    for (let link = source.subHead_; link !== null; link = link.subNext_) {
      const observer = link.observer_;
      const flags = observer.flags_;
      if (flags & NodeFlags.KindComputedNode) {
        observer.flags_ = flags | NodeFlags.Pending;
        if (!(flags & NodeFlags.Pending)) {
          if (link.subNext_ === null) {
            source = observer as ComputedNode;
            continue top;
          }
          propagatePending(observer as ComputedNode);
        }
      } else if (!(flags & NodeFlags.Disposed)) {
        queueSource(source, flags);
      }
    }
    return;
  }
}

export function readSource(source: Source): any {
  if (source.flags_ & (NodeFlags.Dirty | NodeFlags.Pending | NodeFlags.Running)) {
    if (source.flags_ & NodeFlags.KindComputedNode) {
      updateComputed(source as ComputedNode);
    } else {
      source.flags_ &= ~(NodeFlags.Dirty | NodeFlags.WatchSingleWrite);
    }
  }
  return source.value_;
}

function updateComputed(node: ComputedNode): void {
  if (node.flags_ & NodeFlags.Running) {
    throw new Error("loop detected");
  }
  if (!(node.flags_ & NodeFlags.Dirty)) {
    for (let link = node.depHead_; link !== null; link = link.depNext_) {
      readSource(link.source_);
      if (node.flags_ & NodeFlags.Dirty) {
        break;
      }
    }
    if (!(node.flags_ & NodeFlags.Dirty)) {
      node.flags_ &= ~NodeFlags.Pending;
      return;
    }
  }
  const previousObserver = runtime.currentObserver_;
  const track = !(node.flags_ & NodeFlags.DepsStatic) || node.depHead_ === null;
  node.flags_ |= NodeFlags.Running | NodeFlags.Connected;
  if (__DEV__) {
    runtime.__dev_currentComputation = (runtime.__dev_currentComputation! | 0) + 1;
    runtime.__dev_spy?.({ type: "compute-start", node });
  }
  try {
    if (track) {
      node.flags_ ^= NodeFlags.TrackPhase;
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
        : equal === false || !(node.flags_ & NodeFlags.Initialized) || different(equal, node.value_, value)
    ) {
      node.value_ = value;
      if (__DEV__) {
        runtime.__dev_spy?.({ type: "compute-end", node, nextValue: value, changed: true });
      }
      for (let link = node.subHead_; link !== null; link = link.subNext_) {
        if (link.observer_.flags_ & NodeFlags.KindComputedNode) {
          link.observer_.flags_ |= NodeFlags.Dirty;
        } else {
          link.flags_ |= link.flags_ & LinkFlags.Published ? LinkFlags.PublishedMulti : LinkFlags.Published;
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
    node.flags_ = (node.flags_ | NodeFlags.Initialized) & ~(NodeFlags.Dirty | NodeFlags.Pending | NodeFlags.Running);
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
  effect.flags_ &= ~NodeFlags.Connected;
  effect.depTail_ = null;
  trimDependencies(effect);
  effect.callback_ = NOOP_;
  runEffectCleanup(effect);
}

export function runEffect(effect: WatchNode): void {
  const previousObserver = runtime.currentObserver_;
  runtime.currentObserver_ = null;
  effect.flags_ |= NodeFlags.Running;
  const isSub = !!(effect.flags_ & NodeFlags.DepsStatic);
  if (__DEV__) {
    if (!isSub) {
      runtime.__dev_spy?.({ type: "effect-start", node: effect });
    }
  }
  try {
    if (isSub) {
      const link = effect.depHead_!;
      link.flags_ = LinkFlags.None;
      const source = link.source_;
      const value = source.value_;
      link.value_ = value;
      if (__DEV__) {
        runtime.__dev_spy?.({
          type: "subscribe",
          node: source,
          value,
          sync: !(effect.flags_ & NodeFlags.QueueModeAsync),
          count: 1,
        });
      }
      effect.callback_(value);
    } else {
      runEffectCleanup(effect);
      if (!(effect.flags_ & NodeFlags.Disposed)) {
        effect.flags_ ^= NodeFlags.TrackPhase;
        effect.depTail_ = null;
        runtime.currentObserver_ = effect;
        effect.cleanup_ = effect.callback_() || null;
      }
      if (__DEV__) {
        runtime.__dev_spy?.({ type: "effect-end", node: effect });
      }
    }
  } catch (error) {
    if (__DEV__) {
      if (!isSub) {
        runtime.__dev_spy?.({ type: "effect-end", node: effect, error });
      }
    }
    throw error;
  } finally {
    runtime.currentObserver_ = previousObserver;
    effect.flags_ &= ~NodeFlags.Running;
    if (effect.flags_ & NodeFlags.Disposed) {
      finalizeEffectDisposal(effect);
    } else if (!isSub) {
      trimDependencies(effect);
    }
  }
}

function hasEffectChange(effect: WatchNode): boolean {
  for (let link = effect.depHead_; link !== null; link = link.depNext_) {
    const source = link.source_;
    if (!(source.flags_ & NodeFlags.Disposed)) {
      readSource(source);
      if (link.flags_ & LinkFlags.Published) {
        if (!(link.flags_ & LinkFlags.PublishedMulti)) {
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
        link.flags_ &= ~(LinkFlags.Published | LinkFlags.PublishedMulti);
        link.value_ = source.value_;
      }
    }
  }
  return false;
}

function flushEffects(mode: NodeFlags): void {
  const previousObserver = runtime.currentObserver_;
  const wasSyncRunning = syncQueue_.flags_ & QueueFlags.Running;
  runtime.currentObserver_ = null;
  syncQueue_.flags_ |= QueueFlags.Running;
  try {
    while (
      syncQueue_.head_ < syncQueue_.tail_ ||
      (mode & NodeFlags.QueueModeAsync && asyncQueue_.head_ < asyncQueue_.tail_)
    ) {
      const queue = syncQueue_.head_ < syncQueue_.tail_ ? syncQueue_ : asyncQueue_;
      const isAsync = queue === asyncQueue_;
      // Finish the current async wave, then drain sync writes before the next wave.
      const limit = isAsync ? queue.tail_ : 0;
      while (queue.head_ < (isAsync ? limit : queue.tail_) && queue.head_ < queue.tail_) {
        const i = queue.head_++;
        const item = queue.items_[i]!;
        queue.items_[i] = undefined;
        if (item.flags_ & NodeFlags.KindSubscriberNode) {
          item.flags_ &= ~NodeFlags.QueuedSyncSource;
          if (!(item.flags_ & NodeFlags.Disposed) && hasEffectChange(item as WatchNode)) {
            runEffect(item as WatchNode);
          }
        } else {
          item.flags_ &= ~(isAsync ? NodeFlags.QueuedAsyncSource : NodeFlags.QueuedSyncSource);
          if (!(item.flags_ & NodeFlags.Disposed)) {
            const source = item as Source;
            if (source.subHead_ !== null) {
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
      syncQueue_.flags_ &= ~QueueFlags.Running;
    }
    if (mode & NodeFlags.QueueModeAsync && asyncQueue_.head_ === asyncQueue_.tail_) {
      asyncQueue_.flags_ &= ~QueueFlags.Running;
    }
  }
}

function flushAsyncQueue(): void {
  if (syncQueue_.head_ === syncQueue_.tail_ && asyncQueue_.head_ === asyncQueue_.tail_) {
    asyncQueue_.flags_ &= ~QueueFlags.Running;
    return;
  }
  if (__DEV__) {
    runtime.__dev_spy?.({ type: "flush-start", async: true });
    try {
      flushEffects(NodeFlags.QueueModeAsync);
      runtime.__dev_spy?.({ type: "flush-end", async: true });
    } catch (error) {
      runtime.__dev_spy?.({ type: "flush-end", async: true, error });
      throw error;
    }
  } else {
    flushEffects(NodeFlags.QueueModeAsync);
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

export { ComputedNode, ValueNode, WatchNode };
