import { derived, type Readable, type ReadableValues } from "@embra/reactivity";
import { useMemo } from "react";
import type { UseDerivedValueOptions } from "./types";
import { useValue } from "./useValue";
import { useStableSources } from "./utils";

/**
 * Derives a value from a single {@link Readable} using a pure transform function,
 * subscribes to the result, and returns it.
 *
 * Defaults to synchronous updates (`sync: true`).
 */
export function useDerivedValue<T, R>(
  source: Readable<T>,
  compute: (value: T) => R,
  options?: UseDerivedValueOptions<R>,
): R;
/**
 * Derives a value from an array of {@link Readable}s using a pure transform function,
 * subscribes to the result, and returns it.
 *
 * Defaults to synchronous updates (`sync: true`).
 */
export function useDerivedValue<const T extends readonly Readable[], R>(
  sources: T,
  compute: (...values: ReadableValues<T>) => R,
  options?: UseDerivedValueOptions<R>,
): R;
export function useDerivedValue<R>(
  sources: Readable | readonly Readable[],
  compute: (...values: any[]) => R,
  options?: UseDerivedValueOptions<R>,
): R {
  const stableSources = useStableSources(sources);
  const name = options?.name;
  const equal = options?.equal;
  const sync = options?.sync ?? true;

  const node = useMemo(
    () => derived(stableSources as any, compute, { name, equal }),
    [stableSources, compute, name, equal],
  );
  return useValue(node, { sync });
}
