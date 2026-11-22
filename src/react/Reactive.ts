import { computed } from "@embra/reactivity";
import { type ReactNode, useMemo } from "react";
import type { ReactiveProps } from "./types";
import { useValue } from "./useValue";

/**
 * Renders a reactive region in isolation so that updates to the tracked sources
 * only re-render `<Reactive>` rather than its parent component.
 */
export function Reactive({ children, sync, equal, name }: ReactiveProps): ReactNode {
  const isFn = typeof children === "function";
  const node = useMemo(() => (isFn ? computed(children, { name, equal }) : children), [isFn, children, name, equal]);
  return useValue(node, { sync });
}
