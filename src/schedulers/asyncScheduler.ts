import { type Scheduler, type SchedulerFlush, type SchedulerTask } from "./interface";

/**
 * Creates an async {@link Scheduler}.
 *
 * @category Schedulers
 * @param defer - A function that defers the execution of the {@link SchedulerFlush} function.
 * @returns A {@link Scheduler}
 *
 * @example
 * ```ts
 * import { asyncScheduler } from "@embra/reactivity";
 * const MicroTaskScheduler = asyncScheduler(flush => Promise.resolve().then(flush));
 * const AnimationFrameScheduler = asyncScheduler(requestAnimationFrame);
 * ```
 */
export const asyncScheduler = (defer: (flush: SchedulerFlush) => unknown): Scheduler => {
  let tasks: Set<SchedulerTask>;
  let pending: boolean | undefined;
  const flush = (): void => {
    for (const task of tasks) {
      tasks.delete(task);
      try {
        task.schedulerTask_(AsyncScheduler);
      } catch (e) {
        console.error(e);
      }
    }
    pending = false;
  };

  const AsyncScheduler: Scheduler = (task: SchedulerTask): void => {
    (tasks ??= new Set()).add(task);
    pending ||= (defer(flush), true);
  };

  return AsyncScheduler;
};
