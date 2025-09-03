import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type Readable,
  type ReadableLike,
  type Scheduler,
  type Unwrap,
  getReadable,
} from "@embra/reactivity";
import { useDebugValue, useMemo, useSyncExternalStore } from "react";

export interface UseValue {
  /**
   * Accepts a {@link ReadableLike} and returns the latest value.
   * It only triggers re-rendering when new value emitted from $ (base on {@link Readable.version} instead of React's `Object.is` comparison).
   *
   * @param $ A {@link ReadableLike}.
   * @returns the value of the {@link ReadableLike}
   */
  <T = any>($: ReadableLike<T>): T;

  /**
   * Accepts a {@link ReadableLike} and returns the latest value.
   * It only triggers re-rendering when new value emitted from $ (base on {@link Readable.version} instead of React's `Object.is` comparison).
   *
   * @param $ A {@link ReadableLike}.
   * @returns the value of the {@link ReadableLike}, or $ itself if $ is not a {@link ReadableLike}
   */
  <T = any, U = any>($: ReadableLike<T> | U): T | U;
}

const noop = () => {
  /* noop */
};

const returnsNoop = () => noop;

const defaultArgs = [returnsNoop, returnsNoop as () => any] as const;

/**
 * Accepts a {@link ReadableLike} and returns the latest value.
 * It only triggers re-rendering when new value emitted from $ (base on {@link Readable.version} instead of React's `Object.is` comparison).
 *
 * @param $ A {@link ReadableLike}.
 * @param scheduler - An optional {@link Scheduler} to control the update frequency. If not provided, updates are applied synchronously.
 * @returns the value of the {@link ReadableLike}, or $ itself if $ is not a {@link ReadableLike}
 *
 * @example
 * ```tsx
 * import { useValue } from "@embra/reactivity/react";
 *
 * function App({ count$ }) {
 *   const count = useValue(count$);
 *   return <div>{count}</div>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * import { useValue, MicrotaskScheduler } from "@embra/reactivity/react";
 *
 * function App({ rapidChangeCount$ }) {
 *   const count = useValue(rapidChangeCount$, MicrotaskScheduler); // update at most once per microtask
 *   return <div>{count}</div>;
 * }
 * ```
 */
export const useValue: UseValue = <T, U>($: ReadableLike<T> | U, scheduler?: Scheduler): Unwrap<T> | U => {
  const args = useMemo(() => {
    const readable = getReadable($);
    return (
      readable &&
      ([(onChange: () => void) => readable.subscribe(onChange, scheduler), () => readable.version, readable] as const)
    );
  }, [$, scheduler]);

  const [subscriber, getSnapshot, readable] = args ?? defaultArgs;

  const version = useSyncExternalStore(
    subscriber,
    getSnapshot,
    // It is safe to use the same value getter for server snapshot since val() can
    // be initialized with a default value.
    getSnapshot,
  );

  const value = useMemo(() => (readable ? readable.get() : $), [version, readable, $]);

  useDebugValue(value);

  return value;
};
