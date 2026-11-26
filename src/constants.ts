export const CONTRACT_VERSION = "v1";
export type CONTRACT_VERSION = typeof CONTRACT_VERSION;
export const CONTRACT_SYMBOL: unique symbol = Symbol.for("@embra/reactivity");

export enum NodeFlags {
  None = 0,

  // Keep frequent flags and their combined masks in low bits.
  Disposed = 1 << 0,
  KindComputedNode = 1 << 1,
  KindSubscriberNode = 1 << 2,
  Running = 1 << 3,
  Dirty = 1 << 4, // An unconsumed source write or a confirmed computed input.
  QueueModeAsync = 1 << 5,
  Pending = 1 << 6, // A Computed needs validation.
  QueuedSyncSource = 1 << 7,

  // Unvisited links are removed after each collection, so one alternating bit is sufficient.
  QueuedDisconnect = 1 << 8,
  TrackPhase = 1 << 9,
  DepsStatic = 1 << 10,
  QueuedAsyncSource = 1 << 11,
  Connected = 1 << 12, // An observer's upstream links are attached.
  Initialized = 1 << 13,
  WatchSingleWrite = 1 << 14, // A Value has Watch links to mark on its next coalesced write.
}

export enum LinkFlags {
  None = 0,
  Published = 1 << 0, // A Watch input has a single unconsumed change.
  PublishedMulti = 1 << 1, // A Watch input has multiple unconsumed changes.
  TrackPhase = NodeFlags.TrackPhase,
}
