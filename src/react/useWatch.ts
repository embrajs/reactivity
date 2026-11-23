import { arrayShallowEqual, type EffectContext, type WatchEffect, type WatchOptions, watch } from "@embra/reactivity";
import { type DependencyList, useEffect, useRef, useState } from "react";
import { useIsomorphicLayoutEffect } from "./utils";

/**
 * Runs a reactive {@link watch} effect inside `useEffect` and automatically disposes it on unmount.
 * When `deps` is omitted, the watcher starts once on mount and stays active across re-renders.
 */
export function useWatch(effect: WatchEffect, options?: WatchOptions): void;
/**
 * Runs a reactive {@link watch} effect inside `useEffect`, restarting it whenever `deps` changes,
 * and automatically disposes it on unmount.
 */
export function useWatch(effect: WatchEffect, deps: DependencyList, options?: WatchOptions): void;
export function useWatch(
  effect: WatchEffect,
  depsOrOptions?: DependencyList | WatchOptions,
  options?: WatchOptions,
): void {
  const hasDeps = Array.isArray(depsOrOptions);
  const deps = hasDeps ? depsOrOptions : undefined;
  const sync = (hasDeps ? options : (depsOrOptions as WatchOptions | undefined))?.sync;

  const effectRef = useRef(effect);
  useIsomorphicLayoutEffect(() => {
    effectRef.current = effect;
  });

  const [depsState, setDepsState] = useState<{ deps: DependencyList | undefined; version: number }>(() => ({
    deps,
    version: 0,
  }));

  let depsVersion = depsState.version;
  if (deps !== undefined ? !arrayShallowEqual(depsState.deps, deps) : depsState.deps !== undefined) {
    depsVersion = depsState.version + 1;
    setDepsState({ deps, version: depsVersion });
  }

  useEffect(() => {
    return watch(
      function (this: EffectContext) {
        return effectRef.current.call(this);
      },
      { sync },
    );
  }, [depsVersion, sync]);
}
