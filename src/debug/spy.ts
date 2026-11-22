import type { Source } from "../node";
import { isReadable } from "../reactivity";
import { type DevSpyEvent, NOOP_, runtime } from "../runtime";
import type { Cleanup } from "../types";
import { formatNodeLabel, getNodeName, isReactiveCollection, type ReactiveCollectionInternal } from "./inspect";

let devOnlyWarned = false;

/** @internal */
export function warnDevOnly(): void {
  if (!devOnlyWarned) {
    devOnlyWarned = true;
    console.warn(
      "[@embra/reactivity/debug] spy() and trace(node) require the development build and are no-ops in production.",
    );
  }
}

/**
 * Causal trigger recorded when an upstream source write marks downstream nodes.
 *
 * @category Debug
 */
export interface SpyCause {
  source: unknown;
  prevValue: unknown;
  nextValue: unknown;
}

/**
 * Event emitted by {@link spy}.
 *
 * @category Debug
 */
export type SpyEvent =
  | { type: "batch-start" }
  | { type: "batch-end"; error?: unknown }
  | { type: "flush-start"; async: boolean }
  | { type: "flush-end"; async: boolean; error?: unknown }
  | { type: "set"; node: unknown; prevValue: unknown; nextValue: unknown; changed: boolean }
  | { type: "compute-start"; node: unknown }
  | {
      type: "compute-end";
      node: unknown;
      prevValue: unknown;
      nextValue: unknown;
      changed: boolean;
      duration: number;
      cause?: SpyCause;
      error?: unknown;
    }
  | { type: "effect-start"; node: unknown }
  | { type: "effect-end"; node: unknown; duration: number; cause?: SpyCause; error?: unknown }
  | { type: "subscribe"; node: unknown; value: unknown; sync: boolean; count: number; cause?: SpyCause }
  | { type: "dispose"; node: unknown };

/**
 * Filter predicate or node name pattern for {@link spy}.
 *
 * @category Debug
 */
export type SpyFilter = string | RegExp | ((target: unknown) => boolean);

/**
 * Options for {@link spy} with a custom listener.
 *
 * @category Debug
 */
export interface SpyOptions {
  filter?: SpyFilter;
}

/**
 * Logger interface used by built-in console mode in {@link spy}.
 *
 * @category Debug
 */
export interface SpyLogger {
  log: (...args: any[]) => void;
  group: (...args: any[]) => void;
  groupCollapsed: (...args: any[]) => void;
  groupEnd: () => void;
  trace: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

/**
 * Options for built-in console logging mode of {@link spy}.
 *
 * @category Debug
 */
export interface SpyConsoleOptions extends SpyOptions {
  /** Nest cascading events inside console groups. Defaults to `true`. */
  cascade?: boolean;
  /** Expand console groups by default instead of collapsing them. Defaults to `true`. */
  defaultExpand?: boolean;
  /** Print stack traces for `set` and `effect-end` events. Defaults to `false`. */
  printStack?: boolean;
  /** Custom logger implementation. Defaults to `console`. */
  logger?: SpyLogger;
}

/**
 * Callback invoked for each matching {@link SpyEvent}.
 *
 * @category Debug
 */
export type SpyListener = (event: SpyEvent) => void;

interface ActiveListener {
  fn: SpyListener;
  filter?: SpyFilter;
}

interface StartFrame {
  startTime: number;
  prevValue: unknown;
}

const listeners = new Set<ActiveListener>();
const startStack: StartFrame[] = [];
const causes = new WeakMap<object, SpyCause>();

/** @internal */
export function getSpyCause(node: unknown): SpyCause | undefined {
  return typeof node === "object" && node !== null ? causes.get(node) : undefined;
}

function recordCauses(sourceNode: unknown, prevValue: unknown, nextValue: unknown): void {
  const source: Source | null = isReactiveCollection(sourceNode)
    ? (sourceNode as ReactiveCollectionInternal).source_
    : isReadable(sourceNode)
      ? (sourceNode as Source)
      : null;
  if (source === null || source.subHead_ === null) {
    return;
  }
  const cause: SpyCause = { source: sourceNode, prevValue, nextValue };
  const visited = new Set<object>();
  const queue: Source[] = [source];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (let link = current.subHead_; link !== null; link = link.subNext_) {
      const observer = link.observer_;
      if (!visited.has(observer)) {
        visited.add(observer);
        causes.set(observer, cause);
        if ("subHead_" in observer && observer.subHead_ !== null) {
          queue.push(observer as Source);
        }
      }
    }
  }
}

function matchesFilter(target: unknown, filter: SpyFilter): boolean {
  if (typeof filter === "function") {
    return filter(target);
  }
  const name = getNodeName(target);
  if (typeof filter === "string") {
    return name === filter || name.includes(filter);
  }
  return filter.test(name);
}

function dispatchSpyEvent(raw: DevSpyEvent): void {
  let event: SpyEvent;
  if (raw.type === "compute-start") {
    startStack.push({ startTime: performance.now(), prevValue: (raw.node as Source).value_ });
    event = raw;
  } else if (raw.type === "compute-end") {
    const frame = startStack.pop()!;
    const cause = getSpyCause(raw.node);
    event = {
      type: "compute-end",
      node: raw.node,
      prevValue: frame.prevValue,
      nextValue: raw.nextValue,
      changed: raw.changed,
      duration: performance.now() - frame.startTime,
      ...(cause !== undefined ? { cause } : {}),
      ...(raw.error !== undefined ? { error: raw.error } : {}),
    };
  } else if (raw.type === "effect-start") {
    startStack.push({ startTime: performance.now(), prevValue: undefined });
    event = raw;
  } else if (raw.type === "effect-end") {
    const frame = startStack.pop()!;
    const cause = getSpyCause(raw.node);
    event = {
      type: "effect-end",
      node: raw.node,
      duration: performance.now() - frame.startTime,
      ...(cause !== undefined ? { cause } : {}),
      ...(raw.error !== undefined ? { error: raw.error } : {}),
    };
  } else if (raw.type === "subscribe") {
    const cause = getSpyCause(raw.node);
    event = {
      ...raw,
      ...(cause !== undefined ? { cause } : {}),
    };
  } else {
    if (raw.type === "set" && raw.changed) {
      recordCauses(raw.node, raw.prevValue, raw.nextValue);
    }
    event = raw;
  }

  for (const entry of listeners) {
    if (entry.filter !== undefined && "node" in event && !matchesFilter(event.node, entry.filter)) {
      continue;
    }
    entry.fn(event);
  }
}

function createConsoleListener(options?: SpyConsoleOptions): SpyListener {
  const cascade = options?.cascade ?? true;
  const defaultExpand = options?.defaultExpand ?? true;
  const printStack = options?.printStack ?? false;
  const logger: SpyLogger = options?.logger ?? console;
  const openGroup = defaultExpand ? logger.group.bind(logger) : logger.groupCollapsed.bind(logger);
  const groupStack: { label: string; opened: boolean }[] = [];

  const flushPendingGroups = (): void => {
    for (const frame of groupStack) {
      if (!frame.opened) {
        frame.opened = true;
        openGroup(frame.label);
      }
    }
  };

  return (event: SpyEvent) => {
    if (!cascade) {
      switch (event.type) {
        case "set":
          logger.log(
            `[embra] set ${formatNodeLabel(event.node)}:`,
            event.prevValue,
            "->",
            event.nextValue,
            event.changed ? "" : "(unchanged)",
          );
          if (printStack) {
            logger.trace();
          }
          break;
        case "compute-end": {
          const time = `${event.duration.toFixed(2)}ms`;
          if (event.error !== undefined) {
            logger.error(`[embra] ${formatNodeLabel(event.node)} threw (${time}):`, event.error);
          } else if (event.changed) {
            logger.log(`[embra] ${formatNodeLabel(event.node)}:`, event.prevValue, "->", event.nextValue, `(${time})`);
          } else {
            logger.log(`[embra] ${formatNodeLabel(event.node)}:`, event.nextValue, `(unchanged, ${time})`);
          }
          break;
        }
        case "effect-end": {
          const time = `${event.duration.toFixed(2)}ms`;
          if (event.error !== undefined) {
            logger.error(`[embra] ${formatNodeLabel(event.node)} threw (${time}):`, event.error);
          } else {
            logger.log(`[embra] ${formatNodeLabel(event.node)} (${time})`);
          }
          if (printStack) {
            logger.trace();
          }
          break;
        }
        case "subscribe":
          logger.log(
            `[embra] subscribe(${event.sync ? "sync" : "async"}) ${formatNodeLabel(event.node)} ->`,
            event.value,
            `(${event.count} listeners)`,
          );
          break;
        case "dispose":
          logger.log(`[embra] dispose ${formatNodeLabel(event.node)}`);
          break;
      }
      return;
    }

    switch (event.type) {
      case "batch-start":
        groupStack.push({ label: "[embra] batch", opened: false });
        break;
      case "flush-start":
        groupStack.push({ label: "[embra] async flush", opened: false });
        break;
      case "compute-start":
        groupStack.push({ label: `[embra] ${formatNodeLabel(event.node)}`, opened: false });
        break;
      case "effect-start":
        groupStack.push({ label: `[embra] ${formatNodeLabel(event.node)}`, opened: false });
        break;
      case "batch-end":
      case "flush-end": {
        const frame = groupStack.pop()!;
        if (event.error !== undefined) {
          flushPendingGroups();
          if (!frame.opened) {
            openGroup(frame.label);
            frame.opened = true;
          }
          logger.error("error:", event.error);
        }
        if (frame.opened) {
          logger.groupEnd();
        }
        break;
      }
      case "compute-end": {
        const frame = groupStack.pop()!;
        flushPendingGroups();
        if (!frame.opened) {
          openGroup(frame.label);
        }
        const time = `${event.duration.toFixed(2)}ms`;
        if (event.error !== undefined) {
          logger.error(`threw (${time}):`, event.error);
        } else if (event.changed) {
          logger.log(event.prevValue, "->", event.nextValue, `(${time})`);
        } else {
          logger.log(event.nextValue, `(unchanged, ${time})`);
        }
        logger.groupEnd();
        break;
      }
      case "effect-end": {
        const frame = groupStack.pop()!;
        flushPendingGroups();
        if (!frame.opened) {
          openGroup(frame.label);
        }
        const time = `${event.duration.toFixed(2)}ms`;
        if (event.cause !== undefined) {
          logger.log(
            `triggered by ${formatNodeLabel(event.cause.source)}:`,
            event.cause.prevValue,
            "->",
            event.cause.nextValue,
          );
        }
        if (event.error !== undefined) {
          logger.error(`threw (${time}):`, event.error);
        } else {
          logger.log(`executed in ${time}`);
        }
        if (printStack) {
          logger.trace();
        }
        logger.groupEnd();
        break;
      }
      case "set":
        flushPendingGroups();
        logger.log(
          `[embra] set ${formatNodeLabel(event.node)}:`,
          event.prevValue,
          "->",
          event.nextValue,
          event.changed ? "" : "(unchanged)",
        );
        if (printStack) {
          logger.trace();
        }
        break;
      case "subscribe":
        flushPendingGroups();
        logger.log(
          `[embra] subscribe(${event.sync ? "sync" : "async"}) ${formatNodeLabel(event.node)} ->`,
          event.value,
          `(${event.count} listeners)`,
        );
        break;
      case "dispose":
        flushPendingGroups();
        logger.log(`[embra] dispose ${formatNodeLabel(event.node)}`);
        break;
    }
  };
}

/**
 * Subscribes to reactivity lifecycle events in development builds.
 * Call without a listener to log events to the console (cascading groups by default).
 * In production builds, logs a one-time warning and returns a no-op cleanup.
 *
 * @category Debug
 */
export function spy(options?: SpyConsoleOptions): Cleanup;
export function spy(listener: SpyListener, options?: SpyOptions): Cleanup;
export function spy(listenerOrOptions?: SpyListener | SpyConsoleOptions, maybeOptions?: SpyOptions): Cleanup {
  if (__DEV__) {
    const entry: ActiveListener =
      typeof listenerOrOptions === "function"
        ? { fn: listenerOrOptions, filter: maybeOptions?.filter }
        : { fn: createConsoleListener(listenerOrOptions), filter: listenerOrOptions?.filter };

    if (listeners.size === 0) {
      runtime.__dev_spy = dispatchSpyEvent;
    }
    listeners.add(entry);

    return () => {
      if (listeners.delete(entry) && listeners.size === 0) {
        runtime.__dev_spy = undefined;
      }
    };
  } else {
    warnDevOnly();
    return NOOP_;
  }
}
