import { computed } from "@embra/reactivity";
import { useMemo } from "react";
import type { UseComputedValueOptions } from "./types";
import { useValue } from "./useValue";

/**
 * Evaluates `compute` inside a dynamic {@link computed} node, subscribes to it,
 * and returns the latest value.
 *
 * Defaults to synchronous updates (`sync: true`).
 */
export function useComputedValue<T>(compute: () => T, options?: UseComputedValueOptions<T>): T {
  const name = options?.name;
  const equal = options?.equal;
  const sync = options?.sync ?? true;

  const node = useMemo(() => computed(compute, { name, equal }), [compute, name, equal]);
  return useValue(node, { sync });
}
