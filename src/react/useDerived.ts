import { derived, type Readable, type ReadableOptions, type ReadableValues } from "@embra/reactivity";
import { useMemo, useRef } from "react";
import { useIsomorphicLayoutEffect, useStableSources } from "./utils";

/**
 * Creates a component-local {@link derived} {@link Readable} node from a single {@link Readable}.
 * Always invokes the latest `compute` function committed by the component.
 */
export function useDerived<T, R>(
  source: Readable<T>,
  compute: (value: T) => R,
  options?: ReadableOptions<R>,
): Readable<R>;
/**
 * Creates a component-local {@link derived} {@link Readable} node from an array of {@link Readable}s.
 * Always invokes the latest `compute` function committed by the component.
 */
export function useDerived<const T extends readonly Readable[], R>(
  sources: T,
  compute: (...values: ReadableValues<T>) => R,
  options?: ReadableOptions<R>,
): Readable<R>;
export function useDerived<R>(
  sources: Readable | readonly Readable[],
  compute: (...values: any[]) => R,
  options?: ReadableOptions<R>,
): Readable<R> {
  const stableSources = useStableSources(sources);
  const name = options?.name;
  const equal = options?.equal;

  const computeRef = useRef(compute);
  useIsomorphicLayoutEffect(() => {
    computeRef.current = compute;
  });

  return useMemo(
    () => derived(stableSources as any, (...values: any[]) => computeRef.current(...values), { name, equal }),
    [stableSources, name, equal],
  );
}
