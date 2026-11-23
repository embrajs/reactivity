import type { ReactiveList, ReadonlyReactiveList } from "../collections/reactiveList";
import type { ReactiveMap, ReadonlyReactiveMap } from "../collections/reactiveMap";
import type { ReactiveSet, ReadonlyReactiveSet } from "../collections/reactiveSet";
import type { Observer, Source } from "../node";
import { isReadable } from "../reactivity";
import { runtime } from "../runtime";
import type { Cleanup, Readable } from "../types";
import {
  collectObserverDeps,
  formatNodeLabel,
  getCollectionSnapshot,
  getNodeKind,
  getNodeName,
  isReactiveCollection,
  type NodeKind,
  type ReactiveCollectionInternal,
} from "./inspect";
import { getSpyCause, type SpyCause, type SpyEvent, spy, warnDevOnly } from "./spy";

/**
 * Configuration options for {@link trace}.
 *
 * @category Debug
 */
export interface TraceConfig {
  /** Custom label appended to log headers. */
  name?: string;
  /** Print trace registration and execution stack traces. Defaults to `true`. */
  printStack?: boolean;
  /** Expand console groups by default. Defaults to `true`. */
  defaultExpand?: boolean;
  /** Trigger a `debugger` statement when the traced target runs or changes. Defaults to `false`. */
  break?: boolean;
  /** Custom event handler. When provided, default console logging is suppressed. */
  onEvent?: (event: TraceEvent) => void;
}

/**
 * Dependency diff entry reported in a {@link TraceEvent}.
 *
 * @category Debug
 */
export interface TraceDepDiff {
  dep: any;
  kind: NodeKind | null;
  name: string;
  status: "added" | "updated" | "unchanged" | "removed";
  value: any;
  prevValue?: any;
}

/**
 * Structured payload passed to {@link TraceConfig.onEvent}.
 *
 * @category Debug
 */
export interface TraceEvent {
  target: any;
  kind: NodeKind;
  name: string;
  value?: any;
  prevValue?: any;
  duration?: number;
  cause?: SpyCause;
  deps: TraceDepDiff[];
  error?: unknown;
}

type ReactiveCollectionAny =
  | ReactiveList<any>
  | ReadonlyReactiveList<any>
  | ReactiveMap<any, any>
  | ReadonlyReactiveMap<any, any>
  | ReactiveSet<any>
  | ReadonlyReactiveSet<any>;

interface NodeTraceEntry {
  config: TraceConfig | undefined;
  lastValue: unknown;
  oldDeps: Map<unknown, unknown>;
  traceLocation: Error;
}

interface FnTraceEntry {
  config: TraceConfig | undefined;
  enabled: boolean;
  oldDeps: Map<unknown, unknown>;
  traceLocation: Error;
  wrapped: (...args: any[]) => any;
}

const nodeEntries = new WeakMap<object, NodeTraceEntry>();
const fnEntries = new WeakMap<(...args: never) => unknown, FnTraceEntry>();
let activeNodeCount = 0;
let nodeSpyCleanup: Cleanup | null = null;

function diffDeps(oldDeps: Map<unknown, unknown>, currentDeps: Source[]): TraceDepDiff[] {
  const diffs: TraceDepDiff[] = [];
  const nextDeps = new Map<unknown, unknown>();

  for (const dep of currentDeps) {
    const value = dep.value_;
    nextDeps.set(dep, value);
    const kind = getNodeKind(dep);
    const name = getNodeName(dep);
    if (oldDeps.has(dep)) {
      const prevValue = oldDeps.get(dep);
      if (!Object.is(prevValue, value)) {
        diffs.push({ dep, kind, name, status: "updated", value, prevValue });
      } else {
        diffs.push({ dep, kind, name, status: "unchanged", value });
      }
    } else {
      diffs.push({ dep, kind, name, status: "added", value });
    }
  }

  for (const [dep, prevValue] of oldDeps) {
    if (!nextDeps.has(dep)) {
      diffs.push({
        dep,
        kind: getNodeKind(dep),
        name: getNodeName(dep),
        status: "removed",
        value: prevValue,
      });
    }
  }

  oldDeps.clear();
  for (const [dep, value] of nextDeps) {
    oldDeps.set(dep, value);
  }

  return diffs;
}

function logTraceEvent(event: TraceEvent, traceLocation: Error, config?: TraceConfig): void {
  if (config?.onEvent !== undefined) {
    config.onEvent(event);
    return;
  }

  const openGroup = (config?.defaultExpand ?? true) ? console.group : console.groupCollapsed;
  const customName = config?.name ? `: ${config.name}` : "";
  openGroup(`[embra] trace ${formatNodeLabel(event.target)}${customName}`);

  if (config?.printStack ?? true) {
    console.groupCollapsed("trace location");
    console.log(traceLocation);
    console.groupEnd();

    const timingLabel =
      event.duration !== undefined ? `executed in ${event.duration.toFixed(2)} ms` : "effect location";
    console.groupCollapsed(timingLabel);
    console.trace();
    console.groupEnd();
  } else if (event.duration !== undefined) {
    console.log(`executed in ${event.duration.toFixed(2)} ms`);
  }

  if (event.cause !== undefined) {
    console.log(
      `triggered by ${formatNodeLabel(event.cause.source)}:`,
      event.cause.prevValue,
      "->",
      event.cause.nextValue,
    );
  }

  if (event.error !== undefined) {
    console.error("error:", event.error);
  } else if ("value" in event) {
    console.log(event.value, "<- previous:", event.prevValue);
  }

  for (const diff of event.deps) {
    const label = formatNodeLabel(diff.dep);
    if (diff.status === "added") {
      console.log(`(+) ${label} ->`, diff.value);
    } else if (diff.status === "updated") {
      console.log(`(*) ${label} ->`, diff.value, "<- previous:", diff.prevValue);
    } else if (diff.status === "unchanged") {
      console.log(`(=) ${label} ->`, diff.value);
    } else {
      console.log(`(-) ${label} ->`, diff.value);
    }
  }

  console.groupEnd();
}

function handleNodeEvent(spyEvent: SpyEvent): void {
  if (spyEvent.type === "dispose") {
    untrace(spyEvent.node);
    return;
  }
  if (spyEvent.type !== "set" && spyEvent.type !== "compute-end") {
    return;
  }
  const target = spyEvent.node as object;
  const entry = nodeEntries.get(target);
  if (entry === undefined) {
    return;
  }
  if (spyEvent.type === "set" && !spyEvent.changed) {
    return;
  }

  const kind = getNodeKind(target)!;
  const name = getNodeName(target);
  const isCollection = isReactiveCollection(target);
  const value = isCollection ? getCollectionSnapshot(target as ReactiveCollectionInternal) : spyEvent.nextValue;
  const prevValue = entry.lastValue;
  entry.lastValue = value;

  const currentDeps = kind === "computed" || kind === "derived" ? collectObserverDeps(target as Observer) : [];
  const deps = currentDeps.length > 0 || entry.oldDeps.size > 0 ? diffDeps(entry.oldDeps, currentDeps) : [];

  const traceEvent: TraceEvent = {
    target,
    kind,
    name,
    value,
    prevValue,
    ...(spyEvent.type === "compute-end" ? { duration: spyEvent.duration } : {}),
    ...(spyEvent.type === "compute-end" && spyEvent.error !== undefined ? { error: spyEvent.error } : {}),
    ...(spyEvent.type === "compute-end" ? { cause: spyEvent.cause } : {}),
    deps,
  };

  logTraceEvent(traceEvent, entry.traceLocation, entry.config);

  if (entry.config?.break) {
    // biome-ignore lint/suspicious/noDebugger: intentional debug breakpoint
    debugger;
  }
}

function traceNode<T extends object>(target: T, config?: TraceConfig): T {
  if (__DEV__) {
    const existing = nodeEntries.get(target);
    if (existing !== undefined) {
      existing.config = config;
      return target;
    }
    const lastValue = isReactiveCollection(target)
      ? getCollectionSnapshot(target as ReactiveCollectionInternal)
      : (target as Source).value_;
    nodeEntries.set(target, {
      config,
      lastValue,
      oldDeps: new Map(),
      traceLocation: new Error("TraceLocation"),
    });
    activeNodeCount++;
    if (activeNodeCount === 1) {
      nodeSpyCleanup = spy(handleNodeEvent);
    }
  } else {
    warnDevOnly();
  }
  return target;
}

function traceFn<T extends (...args: any[]) => any>(fn: T, config?: TraceConfig): T {
  const existing = fnEntries.get(fn);
  if (existing !== undefined) {
    existing.config = config;
    existing.enabled = true;
    return existing.wrapped as T;
  }

  const entry: FnTraceEntry = {
    config,
    enabled: true,
    oldDeps: new Map(),
    traceLocation: new Error("TraceLocation"),
    wrapped(this: unknown, ...args: unknown[]) {
      if (!entry.enabled) {
        return fn.apply(this, args);
      }

      const start = performance.now();
      let error: unknown;
      let hasError = false;
      let result: unknown;
      try {
        result = fn.apply(this, args);
      } catch (err) {
        hasError = true;
        error = err;
      }
      const duration = performance.now() - start;
      const observer = runtime.currentObserver_;
      const kind: NodeKind = getNodeKind(observer) ?? "watch";
      const deps = observer !== null ? diffDeps(entry.oldDeps, collectObserverDeps(observer, true)) : [];
      const cause = getSpyCause(observer);

      const traceEvent: TraceEvent = {
        target: fn,
        kind,
        name: fn.name || "",
        duration,
        ...(cause !== undefined ? { cause } : {}),
        ...(hasError ? { error } : {}),
        deps,
      };

      logTraceEvent(traceEvent, entry.traceLocation, entry.config);

      if (entry.config?.break) {
        // biome-ignore lint/suspicious/noDebugger: intentional debug breakpoint
        debugger;
      }

      if (hasError) {
        throw error;
      }
      return result;
    },
  };

  fnEntries.set(fn, entry);
  fnEntries.set(entry.wrapped, entry);
  return entry.wrapped as T;
}

/**
 * Traces a reactive node, reactive collection, or `watch`/`computed` callback.
 * Always returns the target (or a memoized wrapper for callbacks).
 * Tracing the same target multiple times is deduplicated and updates its config.
 *
 * For nodes and collections, tracing is passive and preserves `computed` laziness and automatic disconnection.
 * In production builds, tracing nodes or collections logs a one-time warning and returns the target unchanged.
 *
 * @category Debug
 */
export function trace<T extends Readable>(target: T, config?: TraceConfig): T;
export function trace<T extends ReactiveCollectionAny>(target: T, config?: TraceConfig): T;
export function trace<T extends (...args: any[]) => any>(fn: T, config?: TraceConfig): T;
export function trace(target: unknown, config?: TraceConfig): unknown {
  if (isReadable(target) || isReactiveCollection(target)) {
    return traceNode(target as object, config);
  }
  if (typeof target === "function") {
    return traceFn(target as (...args: any[]) => any, config);
  }
  throw new TypeError("trace expects a Readable, reactive collection, WatchEffect, or compute function");
}

/**
 * Stops tracing a previously traced reactive node, collection, or callback.
 *
 * @category Debug
 */
export function untrace(target: unknown): void {
  if (typeof target === "function") {
    const entry = fnEntries.get(target as (...args: never) => unknown);
    if (entry !== undefined) {
      entry.enabled = false;
    }
    return;
  }
  if (typeof target === "object" && target !== null && nodeEntries.delete(target)) {
    activeNodeCount--;
    if (activeNodeCount === 0 && nodeSpyCleanup !== null) {
      nodeSpyCleanup();
      nodeSpyCleanup = null;
    }
  }
}
