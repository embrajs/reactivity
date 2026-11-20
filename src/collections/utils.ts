import { appendSub, detachCallback, type ICallbackItem, type ICallbackList, invokeCallbacks } from "../broadcast";
import { Flags } from "../constants";
import { batch, writable } from "../reactivity";
import { NOOP_, runtime, syncQueue_ } from "../runtime";
import type { Cleanup, EffectContext, Owned, Readable, Writable } from "../types";

export interface BatchChannel<T = any> extends ICallbackList<ChannelSubscription> {
  flags_: Flags;
  subHead_: ChannelSubscription | null;
  subTail_: ChannelSubscription | null;
  value_: Set<T>;
  source_: Owned<Writable<null>>;
  next_: ChannelSubscription | null;
  end_: ChannelSubscription | null;
}

declare class ChannelSubscription implements ICallbackItem<BatchChannel>, EffectContext {
  list_: BatchChannel | null;
  callback_: (value: any) => void;
  subNext_: ChannelSubscription | null;
  subPrev_: ChannelSubscription | null;
  dispose: Cleanup;
  constructor(list: BatchChannel, callback: (value: any) => void);
}

function ChannelSubscription(this: ChannelSubscription, list: BatchChannel, callback: (value: any) => void) {
  this.list_ = list;
  this.callback_ = callback;
  this.subNext_ = null;
  this.subPrev_ = null;

  this.dispose = (): void => {
    const list = detachCallback(this);
    if (list !== null) {
      list.value_.clear();
    }
  };
}

export interface ReactiveCollection {
  flags_: Flags;
  source_: Owned<Writable> | null;
  $: Readable;
  cleanup_: BatchChannel | null;
  changed_?: BatchChannel | null;
  __dev_disposed_at?: Error | null;
}

function disposeChannel(channel: BatchChannel): void {
  while (channel.subHead_ !== null) {
    channel.subHead_.dispose();
  }
  channel.source_.dispose();
}

function flushChannel(list: BatchChannel): void {
  list.flags_ &= ~Flags.QueuedSyncSource;
  const values = list.value_;
  try {
    if (values.size > 0 && list.subHead_ !== null) {
      if (list.flags_ & Flags.Pending) {
        for (const value of values) {
          invokeCallbacks(list, value);
        }
      } else {
        invokeCallbacks(list, values);
      }
    }
  } finally {
    values.clear();
    if (list.flags_ & Flags.Disposed) {
      disposeChannel(list);
    }
  }
}

function createChannel(flags: Flags): BatchChannel {
  const source = writable(null, { equal: false });
  const channel: BatchChannel = {
    flags_: flags,
    subHead_: null,
    subTail_: null,
    value_: new Set(),
    source_: source,
    next_: null,
    end_: null,
  };
  source.subscribe(() => flushChannel(channel), { sync: true, immediate: false });
  return channel;
}

export function subscribeCollection(collection: ReactiveCollection, flags: Flags, fn: (value: any) => void): Cleanup {
  if (collection.flags_ & Flags.Disposed) {
    return NOOP_;
  }
  const channel =
    flags & Flags.Pending
      ? (collection.cleanup_ ??= createChannel(flags))
      : (collection.changed_ ??= createChannel(flags));
  const subscription = new ChannelSubscription(channel, fn);
  appendSub(channel, subscription);
  return subscription.dispose;
}

export function queueChannel<T>(channel: BatchChannel<T> | null, value: T): void {
  if (channel !== null && channel.subHead_ !== null) {
    const values = channel.value_;
    if (!(channel.flags_ & Flags.QueuedSyncSource)) {
      values.clear();
      channel.flags_ |= Flags.QueuedSyncSource;
    }
    values.add(value);
  }
}

export function queueAllChannel<T>(channel: BatchChannel<T> | null, values: Iterable<T>): void {
  if (channel !== null && channel.subHead_ !== null) {
    for (const value of values) {
      queueChannel(channel, value);
    }
  }
}

export function cancelDisposal<T>(channel: BatchChannel<T> | null, value: T): void {
  if (channel !== null && channel.flags_ & Flags.QueuedSyncSource) {
    channel.value_.delete(value);
  }
}

export function cancelDisposals<T>(channel: BatchChannel<T> | null, values: Iterable<T>): void {
  if (channel !== null && channel.flags_ & Flags.QueuedSyncSource) {
    const set = channel.value_;
    for (const value of values) {
      set.delete(value);
    }
  }
}

export function createCollectionSource<T extends ReactiveCollection>(collection: T): Owned<Writable<T>> {
  const source = writable(collection, { equal: false });
  if (collection.flags_ & Flags.Disposed) {
    source.dispose();
  }
  return source;
}

export function trackCollection(collection: ReactiveCollection): void {
  if (runtime.currentObserver_ !== null && !(collection.flags_ & Flags.Disposed)) {
    collection.$.get();
  }
}

export function notifyCollection(collection: ReactiveCollection): void {
  const cleanup =
    collection.cleanup_ !== null && collection.cleanup_.flags_ & Flags.QueuedSyncSource ? collection.cleanup_ : null;
  const changed =
    collection.changed_ != null && collection.changed_.flags_ & Flags.QueuedSyncSource ? collection.changed_ : null;
  const source = !(collection.flags_ & Flags.Disposed) ? collection.source_ : null;
  if (cleanup !== null || changed !== null) {
    if (syncQueue_.flags_ & Flags.Running) {
      if (cleanup !== null) {
        cleanup.source_.set(null);
      }
      if (changed !== null) {
        changed.source_.set(null);
      }
      if (source !== null) {
        source.set(collection);
      }
    } else if (source === null && (cleanup === null || changed === null)) {
      (cleanup ?? changed)!.source_.set(null);
    } else {
      batch(() => notifyCollection(collection));
    }
  } else if (source !== null) {
    source.set(collection);
  }
}

export function checkCollectionWrite(collection: ReactiveCollection): void {
  if (collection.flags_ & Flags.Disposed) {
    if (collection.__dev_disposed_at) {
      console.error(`${collection.constructor.name.replace(/Impl$/, "")} disposed at:`, collection.__dev_disposed_at);
    }
    throw new Error("disposed");
  }
  if (runtime.__dev_currentComputation) {
    throw new Error("write during computation");
  }
}

export function disposeCollection<V>(collection: ReactiveCollection, values: Iterable<V>): void {
  if (!(collection.flags_ & Flags.Disposed)) {
    collection.flags_ |= Flags.Disposed;
    if (process.env.NODE_ENV !== "production") {
      collection.__dev_disposed_at = new Error();
    }
    if (collection.source_ !== null) {
      collection.source_.dispose();
    }
    const changed = collection.changed_;
    if (changed != null) {
      collection.changed_ = null;
      disposeChannel(changed);
    }
    const cleanup = collection.cleanup_;
    if (cleanup !== null) {
      collection.cleanup_ = null;
      if (cleanup.subHead_ !== null) {
        cleanup.flags_ |= Flags.Disposed;
        queueAllChannel(cleanup, values);
      }
      if (cleanup.flags_ & Flags.QueuedSyncSource) {
        cleanup.source_.set(null);
      } else {
        disposeChannel(cleanup);
      }
    }
  }
}
