import { inspect, type NodeKind, type NodeSnapshot } from "./inspect";

const KIND_LABELS: Record<NodeKind, string> = {
  writable: "Writable",
  readable: "Readable",
  computed: "Computed",
  derived: "Derived",
  watch: "Watch",
  list: "ReactiveList",
  map: "ReactiveMap",
  set: "ReactiveSet",
};

const kindStyle = { style: "color:#a225c2;font-weight:bold" };
const nameStyle = { style: "color:#8c8c8c" };
const badgeStyle = { style: "color:#d97706;font-size:0.9em" };
const disposedBadgeStyle = { style: "color:#dc2626;font-size:0.9em" };
const numberStyle = { style: "color:#268bd2" };
const stringStyle = { style: "color:#e28c5f" };
const keywordStyle = { style: "color:#eb2f96" };
const keyStyle = { style: "color:#881391" };

function formatValue(v: unknown): any {
  if (typeof v === "number" || typeof v === "bigint") {
    return ["span", numberStyle, String(v)];
  }
  if (typeof v === "string") {
    return ["span", stringStyle, JSON.stringify(v)];
  }
  if (typeof v === "boolean" || v === null || v === undefined) {
    return ["span", keywordStyle, String(v)];
  }
  if (typeof v === "symbol") {
    return ["span", stringStyle, v.toString()];
  }
  return ["object", { object: v }];
}

function getStateBadges(snap: NodeSnapshot): string[] {
  const badges: string[] = [];
  if (snap.disposed) {
    badges.push("disposed");
  }
  if (snap.running) {
    badges.push("running");
  }
  if (snap.dirty) {
    badges.push("dirty");
  }
  if (snap.pending) {
    badges.push("pending");
  }
  return badges;
}

function formatRow(label: string, value: any): any {
  return ["div", { style: "margin-left:12px" }, ["span", keyStyle, `${label}: `], value];
}

const formatter = {
  header(obj: unknown): any {
    const snap = inspect(obj);
    if (snap === null) {
      return null;
    }
    const parts: any[] = ["div", {}, ["span", kindStyle, KIND_LABELS[snap.kind]]];
    if (snap.name) {
      parts.push(["span", nameStyle, `(${snap.name})`]);
    }
    const badges = getStateBadges(snap);
    if (badges.length > 0) {
      parts.push(["span", snap.disposed ? disposedBadgeStyle : badgeStyle, ` [${badges.join(", ")}]`]);
    }
    if (snap.kind !== "watch") {
      parts.push("<", formatValue(snap.value), ">");
    }
    return parts;
  },

  hasBody(obj: unknown): boolean {
    return inspect(obj) !== null;
  },

  body(obj: unknown): any {
    const snap = inspect(obj)!;
    const rows: any[] = ["div", {}];
    if (snap.name) {
      rows.push(formatRow("name", formatValue(snap.name)));
    }
    rows.push(formatRow("initialized", formatValue(snap.initialized)));
    rows.push(formatRow("connected", formatValue(snap.connected)));
    if (snap.kind !== "watch") {
      rows.push(formatRow("value", formatValue(snap.value)));
    }
    if (snap.deps.length > 0) {
      rows.push(formatRow("deps", ["object", { object: snap.deps }]));
    }
    if (snap.subs.length > 0) {
      rows.push(formatRow("subs", ["object", { object: snap.subs }]));
    }
    if (snap.syncSubscriberCount > 0 || snap.asyncSubscriberCount > 0) {
      rows.push(
        formatRow("subscribers", formatValue(`sync:${snap.syncSubscriberCount}, async:${snap.asyncSubscriberCount}`)),
      );
    }
    if (snap.disposedAt !== null) {
      rows.push(formatRow("disposedAt", ["object", { object: snap.disposedAt }]));
    }
    return rows;
  },
};

/**
 * Enables custom read-only formatting for `@embra/reactivity` nodes and collections
 * in Chrome DevTools without triggering lazy computation or dependency tracking.
 * Safe to call multiple times (idempotent).
 *
 * @category Debug
 * @see {@link https://www.mattzeunert.com/2016/02/19/custom-chrome-devtools-object-formatters.html}
 */
export function customFormatter(): void {
  const globals = globalThis as { devtoolsFormatters?: unknown[] };
  const list = (globals.devtoolsFormatters ??= []);
  if (!list.includes(formatter)) {
    list.push(formatter);
  }
}
