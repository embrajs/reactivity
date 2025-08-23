import { customFormatter } from "./dev";

export type {
  Get,
  Readable,
  OwnedReadable,
  Writable,
  OwnedWritable,
  ReadableProvider,
  ReadableLike,
  Config,
  Disposer,
  Equal,
  Subscriber,
  SetValue,
  Version,
  Unwrap,
} from "./typings";

export { type Listener, type RemoveListener } from "./event";

export { batch, batchFlush, batchStart } from "./batch";

export { compute, type ComputeFn } from "./compute";
export { derive, type Derive } from "./derive";
export { combine, type Combine, type MapReadablesToValues } from "./combine";

export { readable, type CreateReadable, writable, type CreateWritable, toWritable, type ToWritable } from "./readable";
export { watch, type WatchEffect } from "./watch";

export {
  isReadable,
  type IsReadable,
  isWritable,
  type IsWritable,
  unsubscribe,
  strictEqual,
  arrayShallowEqual,
  getReadable,
} from "./utils";

export { type OnDisposeValue } from "./collections/utils";

export {
  reactiveMap,
  type OwnedReactiveMap,
  type ReactiveMap,
  type ReadonlyReactiveMap,
  type ReactiveMapChanged,
} from "./collections/reactiveMap";

export {
  reactiveSet,
  type OwnedReactiveSet,
  type ReactiveSet,
  type ReadonlyReactiveSet,
  type ReactiveSetChanged,
} from "./collections/reactiveSet";

export {
  reactiveArray,
  type OwnedReactiveArray,
  type ReactiveArray,
  type ReadonlyReactiveArray,
} from "./collections/reactiveArray";

export { customFormatter, trace, type Trace, type TraceConfig } from "./dev";

if (process.env.NODE_ENV !== "production") {
  /* @__PURE__ */ customFormatter();
}
