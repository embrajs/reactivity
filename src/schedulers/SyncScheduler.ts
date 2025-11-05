import { type Scheduler, type SchedulerTask } from "./interface";

/**
 * The default {@link Scheduler} that runs updates synchronously.
 *
 * @category Schedulers
 */
export const SyncScheduler: Scheduler = (task: SchedulerTask): void => task.schedulerTask_(SyncScheduler);
