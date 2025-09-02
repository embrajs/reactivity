import { type Scheduler } from "./interface";

export const SyncScheduler: Scheduler = (callback: () => void): void => callback();
