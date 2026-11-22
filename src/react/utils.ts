import { arrayShallowEqual, type Readable } from "@embra/reactivity";
import { useEffect, useLayoutEffect, useState } from "react";

export const useIsomorphicLayoutEffect = typeof document !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Stabilizes a single {@link Readable} or array of {@link Readable}s across renders
 * in a Concurrent-Mode-safe way using `useState` instead of render-time ref mutation.
 */
export function useStableSources<T extends Readable | readonly Readable[]>(sources: T): T {
  const [stableSources, setStableSources] = useState(sources);
  if (!arrayShallowEqual(stableSources, sources)) {
    setStableSources(sources);
    return sources;
  }
  return stableSources;
}
