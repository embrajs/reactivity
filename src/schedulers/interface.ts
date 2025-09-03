export interface SchedulerTask {
  schedulerTask_(scheduler: Scheduler): void;
}

export interface Scheduler {
  (task: SchedulerTask): void;
}

/**
 * A function that flushes all scheduled Readables (All subscribers of the Readables will be called).
 */
export interface SchedulerFlush {
  (): void;
}
