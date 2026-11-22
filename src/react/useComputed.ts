import { computed, type Readable, type ReadableOptions } from "@embra/reactivity";
import { useMemo, useRef } from "react";
import { useIsomorphicLayoutEffect } from "./utils";

/**
 * Creates a component-local {@link computed} {@link Readable} node that tracks its dependencies
 * dynamically. Always invokes the latest `compute` function committed by the component without
 * changing the returned {@link Readable} reference.
 */
export function useComputed<T>(compute: () => T, options?: ReadableOptions<T>): Readable<T> {
  const name = options?.name;
  const equal = options?.equal;

  const computeRef = useRef(compute);
  useIsomorphicLayoutEffect(() => {
    computeRef.current = compute;
  });

  return useMemo(() => computed(() => computeRef.current(), { name, equal }), [name, equal]);
}
