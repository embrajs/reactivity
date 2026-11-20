import { CONTRACT_SYMBOL, CONTRACT_VERSION, Flags } from "./constants";
import type { Observer, Source, WatchNode } from "./node";

export type QueueItem = Source | WatchNode;

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

export interface Runtime {
  NOOP_: () => void;
  currentObserver_: Observer | null;
  syncQueue_: RuntimeQueue;
  asyncQueue_: RuntimeQueue;
  /** Development-only write guard; omitted from production evaluation. */
  __dev_currentComputation?: unknown;
}

export const runtime = (((globalThis as EmbraReactivityGlobals)[CONTRACT_SYMBOL] ??= {})[CONTRACT_VERSION] ??= {
  NOOP_() {},
  currentObserver_: null,
  syncQueue_: { flags_: Flags.None, items_: [], head_: 0, tail_: 0 },
  asyncQueue_: { flags_: Flags.None, items_: [], head_: 0, tail_: 0 },
});

export const { NOOP_, syncQueue_, asyncQueue_ } = runtime;

export function clearQueue(queue: RuntimeQueue): void {
  for (let i = queue.head_; i < queue.tail_; i++) {
    const item = queue.items_[i];
    if (item !== undefined) {
      item.flags_ &= ~(Flags.QueuedSyncSource | Flags.QueuedAsyncSource);
      queue.items_[i] = undefined;
    }
  }
  queue.head_ = queue.tail_ = 0;
}
