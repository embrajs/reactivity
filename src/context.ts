import { type BatchTask } from "./batch";
import { BRAND } from "./utils";

export interface Context {
  batching_: boolean;
  readonly tasks_: Set<BatchTask>;
}

declare const globalThis: {
  [BRAND]?: Context;
};

export const context: Context = /* @__PURE__ */ (() =>
  (globalThis[BRAND] ??= {
    batching_: false,
    tasks_: new Set<BatchTask>(),
  }))();
