import { Flags } from "../constants";
import type { ComputedNode, Observer, Source, ValueNode, WatchNode } from "../node";
import { isReadable } from "../reactivity";
import { NOOP_, runtime } from "../runtime";

/**
 * Kind of reactive node or collection inspected by debug utilities.
 *
 * @category Debug
 */
export type NodeKind = "writable" | "readable" | "computed" | "derived" | "watch" | "list" | "map" | "set";

/**
 * Read-only snapshot of a reactive node or collection without triggering evaluation or tracking.
 *
 * @category Debug
 */
export interface NodeSnapshot {
  kind: NodeKind;
  name: string;
  value: unknown;
  initialized: boolean;
  dirty: boolean;
  pending: boolean;
  running: boolean;
  connected: boolean;
  disposed: boolean;
  disposedAt: Error | null;
  deps: unknown[];
  subs: unknown[];
  syncSubscriberCount: number;
  asyncSubscriberCount: number;
}

/**
 * Tree node returned by {@link getDependencyTree} and {@link getObserverTree}.
 *
 * @category Debug
 */
export interface GraphTreeNode {
  node: unknown;
  kind: NodeKind;
  name: string;
  value: unknown;
  dirty: boolean;
  pending: boolean;
  running: boolean;
  disposed: boolean;
  syncSubscriberCount: number;
  asyncSubscriberCount: number;
  children: GraphTreeNode[];
}

export interface ReactiveCollectionInternal {
  flags_: Flags;
  source_: ValueNode | null;
  cleanup_: unknown;
  items_?: unknown[];
  __dev_disposed_at?: Error | null;
}

/** @internal */
export function isReactiveCollection(target: unknown): target is ReactiveCollectionInternal {
  return (
    typeof target === "object" &&
    target !== null &&
    !isReadable(target) &&
    typeof (target as ReactiveCollectionInternal).flags_ === "number" &&
    "source_" in target &&
    "cleanup_" in target &&
    (target instanceof Map || target instanceof Set || Array.isArray((target as ReactiveCollectionInternal).items_))
  );
}

/** @internal */
export function isWatchNode(target: unknown): target is WatchNode {
  return (
    typeof target === "object" &&
    target !== null &&
    !isReadable(target) &&
    typeof (target as WatchNode).flags_ === "number" &&
    ((target as WatchNode).flags_ & Flags.KindMask) === Flags.KindSubscriberNode &&
    "depHead_" in target &&
    "callback_" in target
  );
}

/** @internal */
export function getNodeKind(target: unknown): NodeKind | null {
  if (isReadable(target)) {
    const node = target as Source;
    const kind = node.flags_ & Flags.KindMask;
    if (kind === Flags.KindValueNode) {
      return node.set !== NOOP_ ? "writable" : "readable";
    }
    return node.flags_ & Flags.DepsStatic ? "derived" : "computed";
  }
  if (isWatchNode(target)) {
    return "watch";
  }
  if (isReactiveCollection(target)) {
    if (target instanceof Map) {
      return "map";
    }
    if (target instanceof Set) {
      return "set";
    }
    return "list";
  }
  return null;
}

/** @internal */
export function getNodeName(target: unknown): string {
  if (isReadable(target)) {
    const source = target as Source;
    if (source.name) {
      return source.name;
    }
    if ((source.flags_ & Flags.KindMask) === Flags.KindComputedNode) {
      return (source as ComputedNode).compute_?.name || "";
    }
    return "";
  }
  if (isWatchNode(target)) {
    const cb = (target as WatchNode).callback_;
    return cb !== NOOP_ ? cb.name || "" : "";
  }
  return "";
}

const anonHandles = new WeakMap<object, string>();

/** @internal */
export function formatNodeLabel(target: unknown): string {
  const kind = getNodeKind(target) ?? "node";
  const name = getNodeName(target);
  if (name) {
    return `${kind}(${name})`;
  }
  if (typeof target === "object" && target !== null) {
    let handle = anonHandles.get(target);
    if (handle === undefined) {
      handle = Math.floor(Math.random() * 0x10000)
        .toString(16)
        .padStart(4, "0");
      anonHandles.set(target, handle);
    }
    return `${kind}@${handle}`;
  }
  return kind;
}

/** @internal */
export function getCollectionSnapshot(collection: ReactiveCollectionInternal): unknown {
  if (collection instanceof Map) {
    return new Map(Map.prototype[Symbol.iterator].call(collection));
  }
  if (collection instanceof Set) {
    return new Set(Set.prototype[Symbol.iterator].call(collection));
  }
  return collection.items_!.slice();
}

/** @internal */
export function collectObserverDeps(observer: Observer, upToTail = false): Source[] {
  const deps: Source[] = [];
  if (upToTail && observer.depTail_ === null) {
    return deps;
  }
  for (let link = observer.depHead_; link !== null; link = link.depNext_) {
    deps.push(link.source_);
    if (upToTail && link === observer.depTail_) {
      break;
    }
  }
  return deps;
}

/** @internal */
export function collectSourceSubs(source: Source): Observer[] {
  const subs: Observer[] = [];
  for (let link = source.subHead_; link !== null; link = link.subNext_) {
    const observer = link.observer_;
    if ((observer.flags_ & (Flags.KindMask | Flags.DepsStatic)) !== (Flags.KindSubscriberNode | Flags.DepsStatic)) {
      subs.push(observer);
    }
  }
  return subs;
}

function countSubscribers(source: Source, async: boolean): number {
  let count = 0;
  for (let link = source.subHead_; link !== null; link = link.subNext_) {
    const flags = link.observer_.flags_;
    if (
      (flags & (Flags.KindMask | Flags.DepsStatic)) === (Flags.KindSubscriberNode | Flags.DepsStatic) &&
      !!(flags & Flags.QueueModeAsync) === async
    ) {
      count++;
    }
  }
  return count;
}

/**
 * Inspects a reactive node or collection without triggering lazy evaluation or dependency tracking.
 * When called with no arguments, inspects the currently executing `computed` or `watch` observer.
 *
 * @category Debug
 */
export function inspect(): NodeSnapshot | null;
export function inspect(target: unknown): NodeSnapshot | null;
export function inspect(...args: unknown[]): NodeSnapshot | null {
  const node = args.length === 0 ? runtime.currentObserver_ : args[0];
  const kind = getNodeKind(node);
  if (kind === null) {
    return null;
  }

  if (kind === "list" || kind === "map" || kind === "set") {
    const collection = node as ReactiveCollectionInternal;
    const source = collection.source_;
    return {
      kind,
      name: "",
      value: getCollectionSnapshot(collection),
      initialized: true,
      dirty: false,
      pending: false,
      running: false,
      connected: source !== null && source.subHead_ !== null,
      disposed: !!(collection.flags_ & Flags.Disposed),
      disposedAt: collection.__dev_disposed_at ?? null,
      deps: [],
      subs: source !== null ? collectSourceSubs(source) : [],
      syncSubscriberCount: source !== null ? countSubscribers(source, false) : 0,
      asyncSubscriberCount: source !== null ? countSubscribers(source, true) : 0,
    };
  }

  if (kind === "watch") {
    const watchNode = node as WatchNode;
    return {
      kind,
      name: getNodeName(watchNode),
      value: undefined,
      initialized: true,
      dirty: false,
      pending: false,
      running: !!(watchNode.flags_ & Flags.Running),
      connected: !!(watchNode.flags_ & Flags.Connected),
      disposed: !!(watchNode.flags_ & Flags.Disposed),
      disposedAt: null,
      deps: collectObserverDeps(watchNode),
      subs: [],
      syncSubscriberCount: 0,
      asyncSubscriberCount: 0,
    };
  }

  const source = node as Source;
  const flags = source.flags_;
  const isComputed = kind === "computed" || kind === "derived";
  return {
    kind,
    name: getNodeName(source),
    value: source.value_,
    initialized: isComputed ? !!(flags & Flags.Initialized) : true,
    dirty: !!(flags & Flags.Dirty),
    pending: !!(flags & Flags.Pending),
    running: !!(flags & Flags.Running),
    connected: isComputed ? !!(flags & Flags.Connected) : source.subHead_ !== null,
    disposed: !!(flags & Flags.Disposed),
    disposedAt: source.__dev_disposed_at ?? null,
    deps: isComputed ? collectObserverDeps(source as ComputedNode) : [],
    subs: collectSourceSubs(source),
    syncSubscriberCount: countSubscribers(source, false),
    asyncSubscriberCount: countSubscribers(source, true),
  };
}

function buildTree(target: unknown, direction: "deps" | "subs"): GraphTreeNode | null {
  const snap = inspect(target);
  if (snap === null) {
    return null;
  }
  const treeNode: GraphTreeNode = {
    node: target,
    kind: snap.kind,
    name: snap.name,
    value: snap.value,
    dirty: snap.dirty,
    pending: snap.pending,
    running: snap.running,
    disposed: snap.disposed,
    syncSubscriberCount: snap.syncSubscriberCount,
    asyncSubscriberCount: snap.asyncSubscriberCount,
    children: [],
  };
  const related = direction === "deps" ? snap.deps : snap.subs;
  for (const child of related) {
    treeNode.children.push(buildTree(child, direction)!);
  }
  return treeNode;
}

/**
 * Builds the upstream dependency tree of a reactive node without triggering evaluation.
 *
 * @category Debug
 */
export function getDependencyTree(target: unknown): GraphTreeNode | null {
  return buildTree(target, "deps");
}

/**
 * Builds the downstream observer tree of a reactive node or collection without triggering evaluation.
 *
 * @category Debug
 */
export function getObserverTree(target: unknown): GraphTreeNode | null {
  return buildTree(target, "subs");
}

function formatValueSummary(value: unknown): string {
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
    return value.constructor?.name || "Object";
  }
  return String(value);
}

function formatTreeNode(node: GraphTreeNode, prefix: string, isLast: boolean, isRoot: boolean, lines: string[]): void {
  const tags: string[] = [];
  if (node.dirty) {
    tags.push("dirty");
  }
  if (node.pending) {
    tags.push("pending");
  }
  if (node.running) {
    tags.push("running");
  }
  if (node.disposed) {
    tags.push("disposed");
  }
  if (node.syncSubscriberCount > 0) {
    tags.push(`sync:${node.syncSubscriberCount}`);
  }
  if (node.asyncSubscriberCount > 0) {
    tags.push(`async:${node.asyncSubscriberCount}`);
  }
  const label = formatNodeLabel(node.node);
  const valuePart = node.kind === "watch" ? "" : ` = ${formatValueSummary(node.value)}`;
  const tagPart = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
  const connector = isRoot ? "" : isLast ? "└─ " : "├─ ";
  lines.push(`${prefix}${connector}${label}${valuePart}${tagPart}`);

  const childPrefix = isRoot ? "" : `${prefix}${isLast ? "   " : "│  "}`;
  for (let i = 0; i < node.children.length; i++) {
    formatTreeNode(node.children[i], childPrefix, i === node.children.length - 1, false, lines);
  }
}

/**
 * Formats a {@link GraphTreeNode} or a reactive node/collection into a human-readable ASCII tree string.
 *
 * @category Debug
 */
export function formatTree(tree: GraphTreeNode): string;
export function formatTree(target: unknown, direction?: "deps" | "subs"): string;
export function formatTree(targetOrTree: unknown, direction: "deps" | "subs" = "deps"): string {
  const isTree =
    typeof targetOrTree === "object" &&
    targetOrTree !== null &&
    "children" in targetOrTree &&
    "node" in targetOrTree &&
    Array.isArray((targetOrTree as GraphTreeNode).children);
  const tree = isTree
    ? (targetOrTree as GraphTreeNode)
    : direction === "subs"
      ? getObserverTree(targetOrTree)
      : getDependencyTree(targetOrTree);
  if (tree === null) {
    return "";
  }
  const lines: string[] = [];
  formatTreeNode(tree, "", true, true, lines);
  return lines.join("\n");
}
