import { CONTRACT_SYMBOL, CONTRACT_VERSION, Flags } from "./constants";

declare global {
  interface EmbraReactivityTypeSymbols {
    readonly CONTRACT: unique symbol;
  }
  interface EmbraReactivityGlobals {
    [CONTRACT_SYMBOL]?: EmbraReactivityRuntimes;
  }
  interface EmbraReactivityRuntimes {
    [CONTRACT_VERSION]?: IRuntime;
  }
}

export interface IRuntime<Observer = any, QueueItem = any> {
  NOOP_: () => void;
  currentObserver_: Observer | null;
  syncQueue_: RuntimeQueue<QueueItem>;
  asyncQueue_: RuntimeQueue<QueueItem>;
  /** Development-only write guard; omitted from production evaluation. */
  __dev_currentComputation?: unknown;
}

export function getRuntime<Observer = any, QueueItem = any>(): IRuntime<Observer, QueueItem> {
  return (((globalThis as EmbraReactivityGlobals)[CONTRACT_SYMBOL] ??= {})[CONTRACT_VERSION] ??= {
    NOOP_() {},
    currentObserver_: null,
    syncQueue_: { flags_: Flags.None, items_: [], head_: 0, tail_: 0 },
    asyncQueue_: { flags_: Flags.None, items_: [], head_: 0, tail_: 0 },
  });
}

export interface RuntimeQueue<QueueItem = any> {
  /** Running while a batch/flush is active, or an asynchronous flush is scheduled. */
  flags_: Flags;
  items_: (QueueItem | undefined)[];
  head_: number;
  tail_: number;
}
