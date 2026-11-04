import { CONTRACT_SYMBOL, CONTRACT_VERSION } from "./constants";

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
  version_: number;
  currentObserver_: Observer | null;
  syncQueue_: RuntimeQueue<QueueItem>;
  asyncQueue_: RuntimeQueue<QueueItem>;
}

export function getRuntime<Observer = any, QueueItem = any>(): IRuntime<Observer, QueueItem> {
  return (((globalThis as EmbraReactivityGlobals)[CONTRACT_SYMBOL] ??= {})[CONTRACT_VERSION] ??= {
    NOOP_() {},
    version_: 0,
    currentObserver_: null,
    syncQueue_: { queueHead_: null, queueTail_: null, flushing_: false },
    asyncQueue_: { queueHead_: null, queueTail_: null, flushing_: false },
  });
}

export interface RuntimeQueue<QueueItem = any> {
  queueHead_: QueueItem | null;
  queueTail_: QueueItem | null;
  flushing_: boolean;
}
