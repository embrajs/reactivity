import { asyncScheduler } from "./AsyncScheduler";
import { type Scheduler, type SchedulerFlush } from "./interface";

/**
 * A {@link Scheduler} that runs updates at most once per microtask (Promise).
 */
export const MicrotaskScheduler: Scheduler = /* @__PURE__ */ asyncScheduler(
  /* @__PURE__ */ ((tick: Promise<void>, flush: SchedulerFlush): Promise<void> => tick.then(flush)).bind(
    0,
    /* @__PURE__ */ Promise.resolve(),
  ),
);
