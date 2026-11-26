import { isReadable } from "@embra/reactivity";
import { useDebugValue, useMemo, useSyncExternalStore } from "react";
import type { UnwrapReadable, UseValueOptions } from "./types";

interface Snapshot<T> {
  value: T;
}

const NOOP = (): void => {};
const SUBSCRIBE_NOOP = (): (() => void) => NOOP;
const EMPTY_SNAPSHOT: Snapshot<undefined> = { value: undefined };
const GET_EMPTY_SNAPSHOT = (): Snapshot<undefined> => EMPTY_SNAPSHOT;

/**
 * Subscribes to a {@link Readable} and returns its current value, triggering a re-render
 * whenever the source emits a change. If `source` is not a {@link Readable}, it is returned
 * as-is without subscribing.
 *
 * Defaults to synchronous updates (`sync: true`) so controlled inputs and immediate UI state
 * stay in sync with user events.
 */
export function useValue<T>(source: T, options?: UseValueOptions): UnwrapReadable<T> {
  const sync = options?.sync ?? true;
  const readable = isReadable(source) ? source : null;

  const store = useMemo(() => {
    if (readable === null) {
      return null;
    }
    let snapshot: Snapshot<unknown> | null = null;
    const getSnapshot = (): Snapshot<unknown> => {
      const next = readable.get();
      if (snapshot === null || !Object.is(next, snapshot.value)) {
        snapshot = { value: next };
      }
      return snapshot;
    };
    return {
      subscribe(onStoreChange: () => void) {
        return readable.subscribe(
          () => {
            snapshot = { value: readable.get() };
            onStoreChange();
          },
          { sync, immediate: false },
        );
      },
      getSnapshot,
    };
  }, [readable, sync]);

  const snapshot = useSyncExternalStore(
    store ? store.subscribe : SUBSCRIBE_NOOP,
    store ? store.getSnapshot : GET_EMPTY_SNAPSHOT,
    store ? store.getSnapshot : GET_EMPTY_SNAPSHOT,
  );

  const value = (readable !== null ? snapshot.value : source) as UnwrapReadable<T>;
  useDebugValue(value);
  return value;
}
