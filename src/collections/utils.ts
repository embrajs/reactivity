import type { ICallbackItem } from "../broadcast";
import { Flags } from "../constants";
import type { ValueNode } from "../node";
import { writable } from "../reactivity";
import { NOOP_, runtime, syncQueue_ } from "../runtime";
import type { Cleanup, EffectContext, Owned, Readable, Writable } from "../types";

export type BatchChannel<T = any> = Owned<Writable<T[]>> & ValueNode<T[]>;

export interface ReactiveCollection {
  flags_: Flags;
  source_: Owned<Writable> | null;
  $: Readable;
  cleanup_: BatchChannel | null;
  changed_?: BatchChannel | null;
  __dev_disposed_at?: Error | null;
}

const SYNC_SUB = { sync: true, immediate: false } as const;

export function subscribeCollection(collection: ReactiveCollection, flags: Flags, fn: (value: any) => void): Cleanup {
  if (collection.flags_ & Flags.Disposed) {
    return NOOP_;
  }
  const channel =
    flags & Flags.Pending
      ? (collection.cleanup_ ??= writable<any[]>([], { equal: false }) as BatchChannel)
      : (collection.changed_ ??= writable<any[]>([], { equal: false }) as BatchChannel);
  const items = channel.value_;
  if (!(channel.flags_ & Flags.HasSubscriptions)) {
    items.length = 0;
  }
  return channel.subscribe(function (this: EffectContext) {
    const item = this as unknown as ICallbackItem;
    const list = item.list_!;
    if (flags & Flags.Pending) {
      for (let i = 0; i < items.length && item.list_ !== null; i++) {
        fn.call(this, items[i]);
      }
    } else {
      fn.call(this, items);
    }
    if (list.next_ === null) {
      items.length = 0;
    }
  }, SYNC_SUB);
}

export function hasChannelListeners(channel: BatchChannel | null | undefined): channel is BatchChannel {
  return channel != null && !!(channel.flags_ & Flags.HasSubscriptions);
}

export function queueChannel<T>(channel: BatchChannel<T> | null, value: T): void {
  if (hasChannelListeners(channel)) {
    const items = channel.value_;
    const last = items[items.length - 1];
    // biome-ignore lint/suspicious/noSelfCompare: SameValueZero check for NaN
    if (items.length === 0 || (last !== value && (last === last || value === value))) {
      items.push(value);
    }
  }
}

export function queueAllChannel<T>(channel: BatchChannel<T> | null, values: Iterable<T>): void {
  if (hasChannelListeners(channel)) {
    const items = channel.value_;
    for (const value of values) {
      items.push(value);
    }
  }
}

function removeItem<T>(items: T[], value: T): boolean {
  const index = Number.isNaN(value) ? items.findIndex(Number.isNaN) : items.indexOf(value);
  if (index >= 0) {
    items.copyWithin(index, index + 1);
    items.pop();
    return true;
  }
  return false;
}

export function cancelDisposal<T>(channel: BatchChannel<T> | null, value: T): void {
  if (channel !== null && channel.value_.length > 0) {
    removeItem(channel.value_, value);
  }
}

export function cancelDisposals<T>(channel: BatchChannel<T> | null, values: Iterable<T>): void {
  const items = channel !== null ? channel.value_ : null;
  if (items !== null && items.length > 0) {
    for (const value of values) {
      if (removeItem(items, value) && items.length === 0) {
        break;
      }
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

function pendingChannel(channel: BatchChannel | null | undefined): BatchChannel | null {
  return hasChannelListeners(channel) && channel.value_.length > 0 && !(channel.flags_ & Flags.Dirty) ? channel : null;
}

export function notifyCollection(collection: ReactiveCollection): void {
  const cleanup = pendingChannel(collection.cleanup_);
  const changed = pendingChannel(collection.changed_);
  const rawSource = !(collection.flags_ & Flags.Disposed) ? (collection.source_ as ValueNode | null) : null;
  const source =
    rawSource !== null &&
    (rawSource.subHead_ !== null || rawSource.flags_ & Flags.HasSubscriptions) &&
    (!(syncQueue_.flags_ & Flags.Running) || !(rawSource.flags_ & Flags.Dirty))
      ? rawSource
      : null;
  if (cleanup === null && changed === null) {
    source?.set(collection);
  } else {
    const last = (source ?? changed ?? cleanup)!;
    const prev = syncQueue_.flags_;
    syncQueue_.flags_ = prev | Flags.Running;
    if (cleanup !== null && cleanup !== last) {
      cleanup.set(cleanup.value_);
    }
    if (changed !== null && changed !== last) {
      changed.set(changed.value_);
    }
    syncQueue_.flags_ = prev;
    last.set(last === source ? collection : last.value_);
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
      changed.dispose();
    }
    const cleanup = collection.cleanup_;
    if (cleanup !== null) {
      collection.cleanup_ = null;
      queueAllChannel(cleanup, values);
      if (cleanup.value_.length > 0) {
        cleanup.subscribe(() => cleanup.dispose(), SYNC_SUB);
        cleanup.set(cleanup.value_);
      } else {
        cleanup.dispose();
      }
    }
  }
}
