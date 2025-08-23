// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { type Readable, type ReadableLike, type Unwrap, getReadable } from "@embra/reactivity";
import { useDebugValue, useMemo, useSyncExternalStore } from "react";

interface UseValue {
  /**
   * Accepts a {@link ReadableLike} and returns the latest value.
   * It only triggers re-rendering when new value emitted from $ (base on {@link Readable.$version} instead of React's `Object.is` comparison).
   *
   * @param $ A {@link ReadableLike}.
   * @returns the value
   */
  <T = any>($: ReadableLike<T>): T;

  /**
   * Accepts a {@link ReadableLike} and returns the latest value.
   * It only triggers re-rendering when new value emitted from $ (base on {@link Readable.$version} instead of React's `Object.is` comparison).
   *
   * @param $ A {@link ReadableLike}.
   * @returns the value, or undefined if $ is undefined
   */
  <T = any, U = any>($: ReadableLike<T> | U): T | U;
}

const noop = () => {
  /* noop */
};

const returnsNoop = () => noop;

const defaultArgs = [returnsNoop, returnsNoop as () => any] as const;

export const useValue: UseValue = <T>($?: ReadableLike<T>): Unwrap<T> | undefined => {
  const args = useMemo(() => {
    const readable = getReadable($);
    return (
      readable && ([(onChange: () => void) => readable.subscribe(onChange), () => readable.$version, readable] as const)
    );
  }, [$]);

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
