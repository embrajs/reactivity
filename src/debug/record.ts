import { formatNodeLabel } from "./inspect";
import { type SpyCause, type SpyEvent, type SpyFilter, spy } from "./spy";

/**
 * Options for {@link record}.
 *
 * @category Debug
 */
export interface RecordOptions {
  /** Filter recorded events by node name or predicate. */
  filter?: SpyFilter;
  /** Include millisecond timings in the formatted text timeline. Defaults to `false` for deterministic output. */
  timing?: boolean;
}

/**
 * Aggregated event counts from a {@link record} session.
 *
 * @category Debug
 */
export interface RecordStats {
  sets: number;
  unchangedSets: number;
  computes: number;
  unchangedComputes: number;
  effects: number;
  subscribes: number;
  disposes: number;
  errors: number;
}

/**
 * Result returned by {@link record}.
 *
 * @category Debug
 */
export interface RecordResult<T> {
  result: T | undefined;
  error?: unknown;
  events: SpyEvent[];
  stats: RecordStats;
  text: string;
}

function formatRecordValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "function") {
    return `[Function${value.name ? `: ${value.name}` : ""}]`;
  }
  if (typeof value === "object" && value !== null) {
    if (Array.isArray(value)) {
      return `Array(${value.length})`;
    }
    if (value instanceof Map) {
      return `Map(${value.size})`;
    }
    if (value instanceof Set) {
      return `Set(${value.size})`;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return value.constructor?.name || "Object";
    }
  }
  return String(value);
}

function formatCauseSuffix(cause: SpyCause | undefined): string {
  if (cause === undefined) {
    return "";
  }
  return ` <- triggered by ${formatNodeLabel(cause.source)}: ${formatRecordValue(cause.prevValue)} -> ${formatRecordValue(cause.nextValue)}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatEventLine(event: SpyEvent, includeTiming: boolean, state: { depth: number }): string | null {
  const pad = () => "  ".repeat(state.depth);
  switch (event.type) {
    case "batch-start": {
      const line = `${pad()}batch {`;
      state.depth++;
      return line;
    }
    case "batch-end":
      state.depth = Math.max(0, state.depth - 1);
      return event.error !== undefined ? `${pad()}} [error: ${formatError(event.error)}]` : `${pad()}}`;
    case "flush-start": {
      const line = `${pad()}flush(async) {`;
      state.depth++;
      return line;
    }
    case "flush-end":
      state.depth = Math.max(0, state.depth - 1);
      return event.error !== undefined ? `${pad()}} [error: ${formatError(event.error)}]` : `${pad()}}`;
    case "set":
      return `${pad()}set ${formatNodeLabel(event.node)}: ${formatRecordValue(event.prevValue)} -> ${formatRecordValue(event.nextValue)}${event.changed ? "" : " (unchanged)"}`;
    case "compute-start":
      state.depth++;
      return null;
    case "compute-end": {
      state.depth = Math.max(0, state.depth - 1);
      const time = includeTiming ? ` (${event.duration.toFixed(2)}ms)` : "";
      const cause = formatCauseSuffix(event.cause);
      if (event.error !== undefined) {
        return `${pad()}compute ${formatNodeLabel(event.node)} threw: ${formatError(event.error)}${time}${cause}`;
      }
      if (event.changed) {
        return `${pad()}compute ${formatNodeLabel(event.node)}: ${formatRecordValue(event.prevValue)} -> ${formatRecordValue(event.nextValue)}${time}${cause}`;
      }
      return `${pad()}compute ${formatNodeLabel(event.node)}: ${formatRecordValue(event.nextValue)} (unchanged)${time}${cause}`;
    }
    case "effect-start":
      state.depth++;
      return null;
    case "effect-end": {
      state.depth = Math.max(0, state.depth - 1);
      const time = includeTiming ? ` (${event.duration.toFixed(2)}ms)` : "";
      const cause = formatCauseSuffix(event.cause);
      if (event.error !== undefined) {
        return `${pad()}effect ${formatNodeLabel(event.node)} threw: ${formatError(event.error)}${time}${cause}`;
      }
      return `${pad()}effect ${formatNodeLabel(event.node)}${time}${cause}`;
    }
    case "subscribe":
      return `${pad()}subscribe(${event.sync ? "sync" : "async"}) ${formatNodeLabel(event.node)} -> ${formatRecordValue(event.value)} (${event.count} listeners)${formatCauseSuffix(event.cause)}`;
    case "dispose":
      return `${pad()}dispose ${formatNodeLabel(event.node)}`;
  }
}

/**
 * Records all reactivity events during the execution of `fn` (sync or async)
 * and returns the result, captured events, summary statistics, and a plain-text indented timeline.
 *
 * @category Debug
 */
export function record<T>(fn: () => Promise<T>, options?: RecordOptions): Promise<RecordResult<T>>;
export function record<T>(fn: () => T, options?: RecordOptions): RecordResult<T>;
export function record<T>(
  fn: () => T | Promise<T>,
  options?: RecordOptions,
): RecordResult<T> | Promise<RecordResult<T>> {
  const events: SpyEvent[] = [];
  const stats: RecordStats = {
    sets: 0,
    unchangedSets: 0,
    computes: 0,
    unchangedComputes: 0,
    effects: 0,
    subscribes: 0,
    disposes: 0,
    errors: 0,
  };

  const lines: string[] = [];
  const lineState = { depth: 0 };
  const includeTiming = options?.timing ?? false;

  const stop = spy(
    (event) => {
      events.push(event);
      const line = formatEventLine(event, includeTiming, lineState);
      if (line !== null) {
        lines.push(line);
      }
      switch (event.type) {
        case "set":
          if (event.changed) {
            stats.sets++;
          } else {
            stats.unchangedSets++;
          }
          break;
        case "compute-end":
          if (event.error !== undefined) {
            stats.errors++;
          } else if (event.changed) {
            stats.computes++;
          } else {
            stats.unchangedComputes++;
          }
          break;
        case "effect-end":
          if (event.error !== undefined) {
            stats.errors++;
          } else {
            stats.effects++;
          }
          break;
        case "subscribe":
          stats.subscribes++;
          break;
        case "dispose":
          stats.disposes++;
          break;
        case "batch-end":
        case "flush-end":
          if (event.error !== undefined) {
            stats.errors++;
          }
          break;
      }
    },
    { filter: options?.filter },
  );

  const finalize = (result: T | undefined, hasError: boolean, error: unknown): RecordResult<T> => {
    stop();
    const out: RecordResult<T> = {
      result,
      events,
      stats,
      text: lines.join("\n"),
    };
    if (hasError) {
      out.error = error;
    }
    return out;
  };

  try {
    const res = fn();
    if (
      res !== null &&
      (typeof res === "object" || typeof res === "function") &&
      typeof (res as PromiseLike<T>).then === "function"
    ) {
      return (res as Promise<T>).then(
        (resolved) => finalize(resolved, false, undefined),
        (err) => finalize(undefined, true, err),
      );
    }
    return finalize(res as T, false, undefined);
  } catch (err) {
    return finalize(undefined, true, err);
  }
}
