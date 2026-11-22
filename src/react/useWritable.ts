import { type Writable, type WritableOptions, writable } from "@embra/reactivity";
import { useState } from "react";

/**
 * Creates a component-local {@link Writable} reactive value initialized to `initialValue`.
 * The returned reference is stable across re-renders.
 */
export function useWritable<T>(initialValue: T, options?: WritableOptions<T>): Writable<T> {
  const [node] = useState(() => writable(initialValue, options));
  return node;
}
