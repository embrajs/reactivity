export const CONTRACT_VERSION = "v1";
export type CONTRACT_VERSION = typeof CONTRACT_VERSION;
export const CONTRACT_SYMBOL = Symbol.for("@embra/reactivity") as EmbraReactivityTypeSymbols["CONTRACT"];

export enum Flags {
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

export const DEP_SCAN_LIMIT = 8;
