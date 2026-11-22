import { type Readable, type ReadableOptions, readable, type Setter } from "@embra/reactivity";
import { useState } from "react";

/**
 * Creates a component-local read-only {@link Readable} and its bound {@link Setter},
 * returned as `[readable, set]`. Both references are stable across re-renders.
 */
export function useReadable<T>(initialValue: T, options?: ReadableOptions<T>): [Readable<T>, Setter<T>] {
  const [pair] = useState(() => readable(initialValue, options));
  return pair;
}
