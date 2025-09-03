export interface SchedulerTask {
  schedulerTask_(scheduler: Scheduler): void;
}

export interface Scheduler {
  /** @internal */
  (task: SchedulerTask): void;
}

/**
 * A function that flushes all scheduled Readables (All subscribers of the Readables will be called).
 */
export interface SchedulerFlush {
  (): void;
}
