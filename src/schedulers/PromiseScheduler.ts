import { type Scheduler } from "./interface";

export const PromiseScheduler: Scheduler = /* @__PURE__ */ ((
  tick: Promise<void>,
  callback: () => void,
): Promise<void> => tick.then(callback)).bind(0, /* @__PURE__ */ Promise.resolve());
