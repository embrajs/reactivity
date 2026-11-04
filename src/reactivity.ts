import {
  appendDep,
  appendSub,
  type IDepItem,
  type IDepList,
  type ISubItem,
  type ISubList,
  removeSub,
} from "./broadcast";
import type { Cleanup, EqualityConfig, NormalizedEquality, Owned, Setter } from "./types";

const DEP_SCAN_LIMIT = 8;

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

const CONTRACT_VERSION = "v1";
type CONTRACT_VERSION = typeof CONTRACT_VERSION;
const CONTRACT_SYMBOL = Symbol.for("@embra/reactivity") as EmbraReactivityTypeSymbols["CONTRACT"];

interface Runtime {
  NOOP_: () => void;
  version_: number;
  currentObserver_: Observer | null;
  syncQueue_: EffectQueue;
  asyncQueue_: EffectQueue;
}

const runtime = (((globalThis as EmbraReactivityGlobals)[CONTRACT_SYMBOL] ??= {})[CONTRACT_VERSION] ??= {
  NOOP_() {},
  version_: 0,
  currentObserver_: null,
  syncQueue_: { queueHead_: null, queueTail_: null, flushing_: false },
  asyncQueue_: { queueHead_: null, queueTail_: null, flushing_: false },
});
const { NOOP_, syncQueue_, asyncQueue_ } = runtime;

interface EffectQueue {
  queueHead_: EffectNode | null;
  queueTail_: EffectNode | null;
  flushing_: boolean;
}

export type Subscriber<T = any> = (this: EffectContext, value: T) => void;

export interface SubscribeOptions {
  sync?: boolean;
  immediate?: boolean;
}

enum Flags {
  None = 0,

  // Keep frequent masks in low bits to shorten inlined constants.
  Disposed = 1 << 0,

  KindValueNode = 1 << 1, // 01
  KindComputedNode = 2 << 1, // 10
  KindSubscriberNode = 3 << 1, // 11
  KindMask = 0b11 << 1,

  Running = 1 << 3,

  // Unvisited links are removed after each collection, so one alternating bit is sufficient.
  TrackPhase = 1 << 4,
  DepsStatic = 1 << 5,

  Dirty = 1 << 6, // Initial evaluation or retry after failure.
  Pending = 1 << 7, // Inputs may have changed since the last evaluation.
  Failed = 1 << 8,

  Queued = 1 << 9,
  QueueAsync = 1 << 10,
  Subscribed = 1 << 11,
}

type Source<T = any> = ValueNode<T> | ComputedNode<T>;
type Observer<T = any> = EffectNode | ComputedNode<T>;

class Link<T = any> implements ISubItem, IDepItem {
  flags_: Flags;

  subNext_: Link | null;
  subPrev_: Link | null;

  depNext_: Link | null;

  source_: Source<T>;
  observer_: Observer<T>;

  version_: number;
  value_: any;

  constructor(source: Source<T>, observer: Observer<T>) {
    this.flags_ = Flags.None;

    this.subNext_ = null;
    this.subPrev_ = null;

    this.depNext_ = null;

    this.source_ = source;
    this.observer_ = observer;

    this.version_ = source.version_;
    this.value_ = source.value_;
  }
}

export interface EffectContext {
  dispose(): void;
}

export type EffectFn = (this: EffectContext) => undefined | Cleanup;

export type WatchEffect = EffectFn;

class EffectNode implements IDepList, EffectContext {
  flags_: Flags;

  depHead_: Link | null;
  // Confirmed dependency tail during collection; actual tail otherwise.
  depTail_: Link | null;

  queueNext_: EffectNode | null;

  cleanup_: Cleanup | null;
  callback_: (this: EffectContext, ...values: any[]) => void | Cleanup;

  constructor(callback_: (this: EffectContext, ...values: any[]) => void | Cleanup, sync?: boolean) {
    this.flags_ = Flags.KindSubscriberNode;
    if (!sync) {
      this.flags_ |= Flags.QueueAsync;
    }

    this.depHead_ = this.depTail_ = this.queueNext_ = this.cleanup_ = null;

    this.callback_ = callback_;
  }

  dispose(): void {
    if (!(this.flags_ & Flags.Disposed)) {
      this.flags_ |= Flags.Disposed;
      if (!(this.flags_ & Flags.Running)) {
        disposeObserver(this);
      }
    }
  }
}

interface ValueOptions<T> {
  name?: string;
  equal?: EqualityConfig<T>;
}

class ValueNode<T = any> implements ISubList, Writable {
  flags_: Flags;

  subHead_: Link | null;
  subTail_: Link | null;

  declare [CONTRACT_SYMBOL]: CONTRACT_VERSION;
  name: string;

  value_: T;
  version_: number;
  equal_: NormalizedEquality<T>;

  __dev_disposed_at_?: Error;

  get: () => T;
  set: Setter<T>;

  get value(): T {
    return this.get();
  }

  set value(newValue: T) {
    this.set(newValue);
  }

  constructor(value: T, options?: ValueOptions<T>) {
    this.flags_ = Flags.KindValueNode;

    this.subHead_ = null;
    this.subTail_ = null;

    this[CONTRACT_SYMBOL] = CONTRACT_VERSION;
    this.name = options?.name ?? "";

    this.value_ = value;
    this.version_ = 0;
    this.equal_ = options?.equal ?? null;

    this.get = (): T => (
      runtime.currentObserver_ && !(this.flags_ & Flags.Disposed) && trackDependency(this, runtime.currentObserver_),
      this.value_
    );

    this.set = (newValue: T) => {
      if (process.env.NODE_ENV !== "production") {
        if (this.flags_ & Flags.Disposed) {
          if (this.__dev_disposed_at_) {
            console.error("ValueNode disposed at:", this.__dev_disposed_at_);
          }
          throw new Error("disposed");
        }
      }

      const equal = this.equal_;
      if (equal === null ? this.value_ !== newValue : equal === false || !equal(this.value_, newValue)) {
        this.value_ = newValue;
        this.version_++;
        runtime.version_++;

        if (this.subHead_) {
          notifySubscriptions(this);

          if (!syncQueue_.flushing_) {
            syncQueue_.flushing_ = true;
            drainQueue(syncQueue_, NOOP_);
          }
        }
      }
    };
  }

  subscribe(callback_: Subscriber<T>, options?: SubscribeOptions): Cleanup {
    return subscribe(this, callback_, options);
  }

  dispose(): void {
    if (!(this.flags_ & Flags.Disposed)) {
      this.flags_ |= Flags.Disposed;
      if (process.env.NODE_ENV !== "production") {
        this.__dev_disposed_at_ = new Error();
      }
    }
  }
}

class ComputedNode<T = any> implements ISubList, IDepList, Readable<T> {
  flags_: Flags;

  subHead_: Link | null;
  subTail_: Link | null;
  depHead_: Link | null;
  // Confirmed dependency tail during collection; actual tail otherwise.
  depTail_: Link | null;

  declare [CONTRACT_SYMBOL]: CONTRACT_VERSION;
  name: string;

  value_: T | undefined;
  version_: number;
  revision_: number;
  equal_: NormalizedEquality<T>;
  compute_: ((...values: any[]) => T) | null;

  __dev_disposed_at_?: Error;

  get: () => T;

  get value(): T {
    return this.get();
  }

  constructor(compute: (...values: any[]) => T, options?: ReadableOptions<T>) {
    this.flags_ = Flags.KindComputedNode | Flags.Dirty;
    this.subHead_ = this.subTail_ = this.depHead_ = this.depTail_ = null;

    this[CONTRACT_SYMBOL] = CONTRACT_VERSION;
    this.name = options?.name ?? "";
    this.value_ = undefined;
    this.version_ = 0;
    this.revision_ = -1;
    this.equal_ = options?.equal ?? null;
    this.compute_ = compute;

    this.get = (): T => {
      if (!(this.flags_ & Flags.Disposed)) {
        if (this.flags_ & Flags.Running) {
          throw new Error("loop detected");
        }
        const link = runtime.currentObserver_ ? trackDependency(this, runtime.currentObserver_) : null;
        if (needsRefresh(this)) {
          refreshComputed(this);
        }
        if (link) {
          link.version_ = this.version_;
          link.value_ = this.value_;
        }
      }
      return this.value_ as T;
    };
  }

  subscribe(callback: Subscriber<T>, options?: SubscribeOptions): Cleanup {
    return subscribe(this, callback, options);
  }

  dispose(): void {
    if (!(this.flags_ & Flags.Disposed)) {
      this.flags_ |= Flags.Disposed;
      if (process.env.NODE_ENV !== "production") {
        this.__dev_disposed_at_ = new Error();
      }
      this.depTail_ = null;
      cleanupObserver(this);
      this.compute_ = null;
    }
  }
}

function subscribeLink(link: Link): void {
  const source = link.source_;
  if (link.flags_ & Flags.Subscribed || source.flags_ & Flags.Disposed) {
    return;
  }
  link.flags_ |= Flags.Subscribed;
  appendSub(source, link);
  if (source.subHead_ === link && (source.flags_ & Flags.KindMask) === Flags.KindComputedNode) {
    // A passive cache may have missed writes before its first subscriber arrived.
    source.flags_ |= Flags.Pending;
    for (let dep = (source as ComputedNode).depHead_; dep; dep = dep.depNext_) {
      subscribeLink(dep);
    }
  }
}

function unsubscribeLink(link: Link): void {
  if (!(link.flags_ & Flags.Subscribed)) {
    return;
  }
  link.flags_ &= ~Flags.Subscribed;
  const source = link.source_;
  removeSub(source, link);
  if ((source.flags_ & Flags.KindMask) === Flags.KindComputedNode && !source.subHead_) {
    (source as ComputedNode).revision_ = source.flags_ & Flags.Running ? -1 : runtime.version_;
    for (let dep = (source as ComputedNode).depHead_; dep; dep = dep.depNext_) {
      unsubscribeLink(dep);
    }
  }
}

// Only newly confirmed links are returned, so computed can align their snapshots after refreshing.
function trackDependency(source: Source, observer: Observer): Link | undefined {
  const tail = observer.depTail_;
  if (tail?.source_ === source) {
    return;
  }

  const phase = observer.flags_ & Flags.TrackPhase;
  let link = tail ? tail.depNext_ : observer.depHead_;
  if (link?.source_ !== source) {
    let found = source.subTail_;
    if (found) {
      if (found.observer_ === observer && (found.flags_ & Flags.TrackPhase) === phase) {
        return;
      }

      let previous: Link | null = null;
      found = null;
      for (let dep = observer.depHead_, remaining = DEP_SCAN_LIMIT; dep && remaining--; dep = dep.depNext_) {
        if (dep.source_ === source) {
          found = dep;
          break;
        }
        previous = dep;
      }

      if (found) {
        if ((found.flags_ & Flags.TrackPhase) === phase) {
          return;
        }
        // An unvisited match lies after the mismatched candidate and has a predecessor.
        previous!.depNext_ = found.depNext_;
        found.depNext_ = link;
        if (tail) {
          tail.depNext_ = found;
        } else {
          observer.depHead_ = found;
        }
      }
    }

    if (found) {
      link = found;
    } else {
      if (link) {
        unsubscribeLink(link);
        link.source_ = source;
      } else {
        appendDep(observer, (link = new Link(source, observer)));
      }
      if ((observer.flags_ & Flags.KindMask) === Flags.KindSubscriberNode || (observer as ComputedNode).subHead_) {
        subscribeLink(link);
      }
    }
  }

  link.flags_ = (link.flags_ & ~Flags.TrackPhase) | phase;
  link.version_ = source.version_;
  link.value_ = source.value_;
  observer.depTail_ = link;
  return link;
}

function cleanupObserver(observer: Observer): void {
  const tail = observer.depTail_;
  let link = tail ? tail.depNext_ : observer.depHead_;
  if (tail) {
    tail.depNext_ = null;
  } else {
    observer.depHead_ = null;
  }

  while (link) {
    const next = link.depNext_;
    unsubscribeLink(link);
    link.depNext_ = null;
    link = next;
  }
}

function needsRefresh(node: ComputedNode): boolean {
  return (
    !!(node.flags_ & (Flags.Dirty | Flags.Pending | Flags.Running)) ||
    (!node.subHead_ && node.revision_ !== runtime.version_)
  );
}

function refreshComputed(node: ComputedNode): void {
  if (node.flags_ & Flags.Running) {
    throw new Error("loop detected");
  }
  const staticDeps = node.flags_ & Flags.DepsStatic;
  // A write during evaluation must invalidate the next passive read too.
  if (!node.subHead_) {
    node.revision_ = runtime.version_;
  }
  const previousObserver = runtime.currentObserver_;
  if (previousObserver) {
    runtime.currentObserver_ = null;
  }
  node.flags_ |= Flags.Running;

  try {
    if (node.flags_ & Flags.Dirty || hasChangedDependency(node)) {
      if (!staticDeps) {
        node.flags_ ^= Flags.TrackPhase;
        node.depTail_ = null;
        runtime.currentObserver_ = node;
      }
      // Callers establish that the node is alive before refreshing it.
      const value = staticDeps ? callStatic(node, node.compute_!, undefined) : node.compute_!();
      if (!staticDeps) {
        runtime.currentObserver_ = null;
      }
      const equal = node.equal_;
      if (
        node.version_ === 0 ||
        (equal === null ? node.value_ !== value : equal === false || !equal(node.value_, value))
      ) {
        node.value_ = value;
        node.version_++;
      }
    }
    node.flags_ &= ~(Flags.Dirty | Flags.Pending | Flags.Failed);
  } catch (error) {
    node.flags_ |= Flags.Dirty | Flags.Failed;
    throw error;
  } finally {
    if (!staticDeps || previousObserver) {
      runtime.currentObserver_ = previousObserver;
    }
    node.flags_ &= ~Flags.Running;
    if (!staticDeps) {
      cleanupObserver(node);
    }
  }
}

function readLink(link: Link): any {
  const source = link.source_;
  if (
    !(source.flags_ & Flags.Disposed) &&
    (source.flags_ & Flags.KindMask) === Flags.KindComputedNode &&
    needsRefresh(source as ComputedNode)
  ) {
    refreshComputed(source as ComputedNode);
  }
  link.version_ = source.version_;
  return (link.value_ = source.value_);
}

function callStatic<T>(observer: Observer, callback: (...values: any[]) => T, context: EffectContext | undefined): T {
  const previousObserver = runtime.currentObserver_;
  if (previousObserver) {
    runtime.currentObserver_ = null;
  }
  try {
    const link = observer.depHead_;
    if (link && !link.depNext_) {
      return context ? callback.call(context, readLink(link)) : callback(readLink(link));
    }
    const values = [];
    for (let dep = link; dep; dep = dep.depNext_) {
      values.push(readLink(dep));
    }
    return callback.apply(context, values);
  } finally {
    if (previousObserver) {
      runtime.currentObserver_ = previousObserver;
    }
  }
}

/**
 * @throws User callback may throw an error
 */
function runEffect(effect: EffectNode): void {
  if (effect.flags_ & Flags.DepsStatic) {
    callStatic(effect, effect.callback_, effect);
  } else {
    const previousObserver = runtime.currentObserver_;
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
        disposeObserver(effect);
      } else {
        cleanupObserver(effect);
      }
    }
  }
}

function runCleanup(observer: EffectNode): void {
  const cleanup = observer.cleanup_;
  if (cleanup) {
    observer.cleanup_ = null;
    callUntracked(cleanup, undefined);
  }
}

function disposeObserver(observer: EffectNode): void {
  observer.depTail_ = null;
  cleanupObserver(observer);
  observer.callback_ = NOOP_;
  runCleanup(observer);
}

function notifySubscriptions<T>(source: Source<T>): void {
  for (let link = source.subHead_; link; link = link.subNext_) {
    const observer = link.observer_;
    if ((observer.flags_ & Flags.KindMask) === Flags.KindComputedNode) {
      const flags = observer.flags_;
      observer.flags_ = (flags | Flags.Pending) & ~Flags.Failed;
      if (!(flags & (Flags.Dirty | Flags.Pending)) || flags & Flags.Failed) {
        notifySubscriptions(observer as ComputedNode);
      }
    } else {
      enqueue(observer as EffectNode);
    }
  }
}

function flushAsyncQueue(): void {
  drainQueue(asyncQueue_, NOOP_);
}

function enqueue(effect: EffectNode): void {
  if (effect.flags_ & Flags.Queued) {
    return;
  }
  effect.flags_ |= Flags.Queued;
  effect.queueNext_ = null;

  const queue = effect.flags_ & Flags.QueueAsync ? asyncQueue_ : syncQueue_;

  if (queue.queueTail_) {
    queue.queueTail_.queueNext_ = effect;
  } else {
    queue.queueHead_ = effect;
  }
  queue.queueTail_ = effect;

  if (queue === asyncQueue_ && !asyncQueue_.flushing_) {
    asyncQueue_.flushing_ = true;
    queueMicrotask(flushAsyncQueue);
  }
}

function drainQueue(queue: EffectQueue, firstError: unknown): void {
  while (queue.queueHead_) {
    const effect = queue.queueHead_;
    queue.queueHead_ = effect.queueNext_;
    if (!queue.queueHead_) {
      queue.queueTail_ = null;
    }

    effect.queueNext_ = null;
    effect.flags_ &= ~Flags.Queued;

    if (!(effect.flags_ & Flags.Disposed)) {
      try {
        if (hasChangedDependency(effect)) {
          runEffect(effect);
        }
      } catch (error) {
        if (firstError === NOOP_) {
          firstError = error;
        }
      }
    }
  }

  queue.flushing_ = false;

  if (firstError !== NOOP_) {
    throw firstError;
  }
}

/**
 * @throws User equal may throw an error
 */
function hasChangedDependency(observer: Observer): boolean {
  for (let link = observer.depHead_; link; link = link.depNext_) {
    const source = link.source_;
    if (source.flags_ & Flags.Disposed) {
      // Live computations can consume a frozen input; effects cannot be triggered by it.
      if ((observer.flags_ & Flags.KindMask) === Flags.KindSubscriberNode) {
        continue;
      }
    } else if ((source.flags_ & Flags.KindMask) === Flags.KindComputedNode && needsRefresh(source as ComputedNode)) {
      refreshComputed(source as ComputedNode);
    }
    if (source.version_ !== link.version_) {
      const equal = source.equal_;
      if (
        source.version_ === link.version_ + 1 ||
        (equal === null ? link.value_ !== source.value_ : equal === false || !equal(link.value_, source.value_))
      ) {
        return true;
      }

      link.version_ = source.version_;
      link.value_ = source.value_;
    }
  }
  return false;
}

function callUntracked<T>(fn: (value: T) => void, value: T): void {
  const previousObserver = runtime.currentObserver_;
  runtime.currentObserver_ = null;
  try {
    fn(value);
  } finally {
    runtime.currentObserver_ = previousObserver;
  }
}

function getSource(value: ReadableLike): Source;
function getSource(value: unknown): Source | undefined;
function getSource(value: unknown): Source | undefined {
  if (isReadable(value) || isReadable((value = (value as ReadableProvider | undefined)?.$))) {
    return value as Source;
  }
}

function addStaticDependency(source: Source, observer: Observer): Link {
  if (process.env.NODE_ENV !== "production") {
    if (source.flags_ & Flags.Disposed) {
      if (source.__dev_disposed_at_) {
        console.error("Source disposed at:", source.__dev_disposed_at_);
      }
      throw new Error("disposed");
    }
  }
  const link = new Link(source, observer);
  appendDep(observer, link);
  if ((observer.flags_ & Flags.KindMask) === Flags.KindSubscriberNode) {
    subscribeLink(link);
  }
  return link;
}

export interface Readable<T = any> {
  [CONTRACT_SYMBOL]: CONTRACT_VERSION;
  readonly value: T;
  get(): T;
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

export function isReadable<T = any>(value: unknown): value is Readable<T> {
  return (value as Readable | undefined)?.[CONTRACT_SYMBOL] === CONTRACT_VERSION;
}

export function isWritable<T = any>(value: unknown): value is Writable<T> {
  return isReadable(value) && ((value as Writable).set || NOOP_) !== NOOP_;
}

export function isReadableProvider<T = any>(value: unknown): value is ReadableProvider<T> {
  return isReadable<T>((value as ReadableProvider<T> | undefined)?.$);
}

export function isReadableLike<T = any>(value: unknown): value is ReadableLike<T> {
  return isReadable<T>(value) || isReadableProvider<T>(value);
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

export function computed<T>(compute: () => T, options?: ReadableOptions<T>): Owned<Readable<T>> {
  return new ComputedNode(compute, options);
}

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
    const source = getSource(sources);
    if (source) {
      addStaticDependency(source, node);
    } else {
      for (const dep of sources as readonly ReadableLike[]) {
        addStaticDependency(getSource(dep), node);
      }
    }
  } catch (error) {
    node.dispose();
    throw error;
  }
  return node;
}

export function subscribe<T>(source: ReadableLike<T>, callback: Subscriber<T>, options?: SubscribeOptions): Cleanup;
export function subscribe<const T extends readonly ReadableLike[]>(
  sources: T,
  callback: (this: EffectContext, ...values: ReadableValues<T>) => void,
  options?: SubscribeOptions,
): Cleanup;
export function subscribe(
  sources: ReadableLike | readonly ReadableLike[],
  callback: (this: EffectContext, ...values: any[]) => void,
  options?: SubscribeOptions,
): Cleanup {
  const effect = new EffectNode(callback, options?.sync);
  effect.flags_ |= Flags.DepsStatic;
  try {
    const source = getSource(sources);
    if (source) {
      readLink(addStaticDependency(source, effect));
    } else {
      for (const dep of sources as readonly ReadableLike[]) {
        readLink(addStaticDependency(getSource(dep), effect));
      }
    }
    if (options?.immediate !== false) {
      runEffect(effect);
    }
  } catch (error) {
    effect.dispose();
    throw error;
  }
  return () => effect.dispose();
}

export interface WatchOptions {
  sync?: boolean;
}

export function watch(effect: WatchEffect, options?: WatchOptions): Cleanup {
  const observer = new EffectNode(effect, options?.sync);
  const shouldFlush = !syncQueue_.flushing_ && (syncQueue_.flushing_ = true);

  try {
    runEffect(observer);
    if (shouldFlush) {
      drainQueue(syncQueue_, NOOP_);
    }
  } catch (error) {
    try {
      observer.dispose();
    } catch {
      // Keep the first error if cleanup also fails.
    }
    if (shouldFlush) {
      drainQueue(syncQueue_, error);
    }
    throw error;
  }

  return () => observer.dispose();
}

export function batch<T>(fn: () => T): T {
  const shouldFlush = !syncQueue_.flushing_ && (syncQueue_.flushing_ = true);
  let firstError: unknown = NOOP_;

  try {
    return fn();
  } catch (error) {
    firstError = error;
    throw error;
  } finally {
    if (shouldFlush) {
      drainQueue(syncQueue_, firstError);
    }
  }
}
