import {
  derived,
  type Readable,
  type ReadableOptions,
  type ReadableValue,
  type ReadableValues,
} from "@embra/reactivity";
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
 * Creates a component-local {@link derived} {@link Readable} node from a single {@link Readable}, `null`, or `undefined`.
 * `null` and `undefined` sources pass through as `null` / `undefined` without subscribing.
 * Always invokes the latest `compute` function committed by the component.
 */
export function useDerived<T extends Readable | null | undefined, R>(
  source: T,
  compute: (value: ReadableValue<T>) => R,
  options?: ReadableOptions<R>,
): Readable<R>;
/**
 * Creates a component-local {@link derived} {@link Readable} node from an array of {@link Readable}s (or `null` / `undefined` entries).
 * `null` and `undefined` entries pass through as `null` / `undefined` without subscribing.
 * Always invokes the latest `compute` function committed by the component.
 */
export function useDerived<const T extends readonly (Readable | null | undefined)[], R>(
  sources: T,
  compute: (...values: ReadableValues<T>) => R,
  options?: ReadableOptions<R>,
): Readable<R>;
export function useDerived<R>(
  sources: Readable | null | undefined | readonly (Readable | null | undefined)[],
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
