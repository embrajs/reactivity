export const CONTRACT_VERSION = "v1";
export type CONTRACT_VERSION = typeof CONTRACT_VERSION;
export const CONTRACT_SYMBOL = Symbol.for("@embra/reactivity") as EmbraReactivityTypeSymbols["CONTRACT"];

export enum Flags {
  None = 0,

  // Keep frequent flags and their combined masks in low bits.
  Disposed = 1 << 0,
  KindValueNode = 1 << 1, // 01
  KindComputedNode = 2 << 1, // 10
  KindSubscriberNode = 3 << 1, // 11
  KindMask = 0b11 << 1,
  Running = 1 << 3,
  Dirty = 1 << 4, // An unconsumed source write, a confirmed computed input, or a published Watch input.
  QueueAsync = 1 << 5,
  Pending = 1 << 6, // A computed node's inputs may have changed.
  QueuedSyncSource = 1 << 7,
  HasSubscriptions = 1 << 8, // At least one synchronous or asynchronous subscription group exists.

  // Unvisited links are removed after each collection, so one alternating bit is sufficient.
  TrackPhase = 1 << 9,
  DepsStatic = 1 << 10,
  QueuedAsyncSource = 1 << 11,
  Connected = 1 << 12, // An observer's upstream links are attached.
  Initialized = 1 << 13,

  // SubscriptionList-only; its flags never contain the node's Disposed bit.
  ForceNotify = 1 << 0,
}
