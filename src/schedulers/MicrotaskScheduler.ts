import { asyncScheduler } from "./asyncScheduler";
import { type Scheduler, type SchedulerFlush } from "./interface";

/**
 * A {@link Scheduler} that runs updates at most once per microtask (Promise).
 *
 * @category Schedulers
 *
 * @example
 * ```ts
 * import { writable, compute, MicrotaskScheduler } from "@embra/reactivity";
 *
 * const v1$ = writable(1);
 * const v2$ = writable(2);
 * const computed$ = compute((get) => get(v1$) + get(v2$));
 *
 * computed$.reaction(
 *   (value) => {
 *     console.log(value)
 *   },
 *   MicrotaskScheduler,
 * );
 * ```
 */
export const MicrotaskScheduler: Scheduler = /* @__PURE__ */ asyncScheduler(
  /* @__PURE__ */ ((tick: Promise<void>, flush: SchedulerFlush): Promise<void> => tick.then(flush)).bind(
    0,
    /* @__PURE__ */ Promise.resolve(),
  ),
);
