export interface Scheduler {
  (callback: () => void): unknown;
}
