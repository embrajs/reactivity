import { CONTRACT_SYMBOL, CONTRACT_VERSION, NodeFlags } from "./constants";
import type { Observer, Source, WatchNode } from "./node";

export type QueueItem = Source | WatchNode;

declare global {
  interface EmbraReactivityGlobals {
    [CONTRACT_SYMBOL]?: EmbraReactivityRuntimes;
  }
  interface EmbraReactivityRuntimes {
    [CONTRACT_VERSION]?: Runtime;
  }
}

export enum QueueFlags {
  None = 0,
  Running = 1 << 0,
}

interface RuntimeQueue {
  /** Running while a batch/flush is active, or an asynchronous flush is scheduled. */
  flags_: QueueFlags;
  items_: (QueueItem | undefined)[];
  head_: number;
  tail_: number;
}

export type DevSpyEvent =
  | { type: "batch-start" }
  | { type: "batch-end"; error?: unknown }
  | { type: "flush-start"; async: boolean }
  | { type: "flush-end"; async: boolean; error?: unknown }
  | { type: "set"; node: unknown; prevValue: unknown; nextValue: unknown; changed: boolean }
  | { type: "compute-start"; node: unknown }
  | { type: "compute-end"; node: unknown; nextValue: unknown; changed: boolean; error?: unknown }
  | { type: "effect-start"; node: unknown }
  | { type: "effect-end"; node: unknown; error?: unknown }
  | { type: "subscribe"; node: unknown; value: unknown; sync: boolean; count: number }
  | { type: "dispose"; node: unknown };

export interface Runtime {
  NOOP_: () => void;
  currentObserver_: Observer | null;
  syncQueue_: RuntimeQueue;
  asyncQueue_: RuntimeQueue;
  /** Development-only write guard; omitted from production evaluation. */
  __dev_currentComputation?: number;
  /** Development-only spy hook; omitted from production evaluation. */
  __dev_spy?: (event: DevSpyEvent) => void;
  /** Development-only spy handlers shared across module copies; omitted from production evaluation. */
  __dev_spies?: Set<(event: DevSpyEvent) => void>;
}

export const runtime = (((globalThis as EmbraReactivityGlobals)[CONTRACT_SYMBOL] ??= {})[CONTRACT_VERSION] ??= {
  NOOP_() {},
  currentObserver_: null,
  syncQueue_: { flags_: QueueFlags.None, items_: [], head_: 0, tail_: 0 },
  asyncQueue_: { flags_: QueueFlags.None, items_: [], head_: 0, tail_: 0 },
});

export const { NOOP_, syncQueue_, asyncQueue_ } = runtime;

export function clearQueue(queue: RuntimeQueue): void {
  for (let i = queue.head_; i < queue.tail_; i++) {
    const item = queue.items_[i]!;
    item.flags_ &= ~(NodeFlags.QueuedSyncSource | NodeFlags.QueuedAsyncSource);
    queue.items_[i] = undefined;
  }
  queue.head_ = queue.tail_ = 0;
}
