import { type BatchTask } from "./batch";
import { BRAND } from "./utils";

export interface Context {
  batching_: boolean;
  readonly batchTask_: Set<BatchTask>;
  replaceMarkers_?: Set<any>;
}

// eslint-disable-next-line no-shadow-restricted-names
declare const globalThis: {
  [BRAND]?: Context;
};

export const context: Context = /* @__PURE__ */ (() =>
  (globalThis[BRAND] ??= {
    batching_: false,
    batchTask_: new Set<BatchTask>(),
  }))();
