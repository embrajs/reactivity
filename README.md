# @embra/reactivity

<p align="center">
  <img width="200" src="https://raw.githubusercontent.com/embrajs/reactivity/main/assets/embra.svg">
</p>

[![Docs](https://img.shields.io/badge/Docs-read-%23fdf9f5)](https://embrajs.github.io/reactivity)
[![Build Status](https://github.com/embrajs/reactivity/actions/workflows/build.yml/badge.svg)](https://github.com/embrajs/reactivity/actions/workflows/build.yml)
[![npm-version](https://img.shields.io/npm/v/@embra/reactivity.svg)](https://www.npmjs.com/package/@embra/reactivity)
[![Coverage Status](https://embrajs.github.io/reactivity/coverage-badges/@embra/reactivity.svg)](https://embrajs.github.io/reactivity/coverage/)

Fine-grained reactivity with explicit ownership, built for AI agents.

## Features

- **Explicit boundaries, zero proxy magic**: No `Proxy` traps or hidden mutation channels; `readable()` returns a `[source, set]` tuple so read/write boundaries stay clear when reading or editing code in isolation.
- **Dynamic and static derivation**: `computed()` tracks dependencies automatically, while `derived()` declares static dependencies explicitly. Both evaluate lazily and disconnect automatically when unobserved.
- **Zero-cost ownership & loud failures**: Ownership is enforced at the type level with no runtime wrapper overhead—creators receive `Owned<T>`, while passing `Readable<T>` or `Writable<T>` hides `dispose()` with zero extra allocation. Dependency cycles and dev-mode writes to disposed sources fail immediately with the original disposal stack trace.
- **Predictable scheduling**: `watch()` and `source.subscribe()` batch notifications in a microtask by default, with `{ sync: true }` and `batch()` when synchronous execution is needed.
- **Text-native observability**: `@embra/reactivity/debug` provides non-intrusive snapshots (`inspect`), plain-text dependency and observer trees (`formatTree`), causal attribution (`spy` / `trace`), and deterministic text timelines (`record`)—designed for tests and AI agent diagnostics, with zero production overhead via package export conditions.

![export size](https://embrajs.github.io/reactivity/assets/export-size.svg)

## Install

```sh
npm add @embra/reactivity
```

| Entry Point               | Purpose                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `@embra/reactivity`       | Core primitives (`writable`, `readable`, `computed`, `derived`, `watch`, `until`, `batch`, `flush`, `untrack`) and reactive collections |
| `@embra/reactivity/react` | React hooks (`useValue`, `useComputed`, `useDerived`, `useWatch`, etc.) and `<Reactive>`                                                |
| `@embra/reactivity/debug` | Graph inspection, tracing, spying, recording, and Chrome DevTools custom formatter                                                      |

## Quick Start

```ts
import { batch, computed, derived, watch, writable } from "@embra/reactivity";

const firstName$ = writable("Ada");
const lastName$ = writable("Lovelace");

// Dynamic dependency tracking
const fullName$ = computed(() => `${firstName$.value} ${lastName$.value}`);

// Explicit static dependencies
const greeting$ = derived(fullName$, (name) => `Hello, ${name}!`);

const stop = watch(() => {
  console.log(greeting$.value);
});

batch(() => {
  firstName$.value = "Grace";
  lastName$.value = "Hopper";
});

stop();
```

## Core Concepts

### State & Encapsulation (`writable` / `readable`)

Use `writable()` for mutable state and `readable()` when you want to keep the setter private:

```ts
import { arrayShallowEqual, readable, writable } from "@embra/reactivity";

const count$ = writable(0);
count$.value = 1;
count$.set(2);
count$.update((n) => n + 1);

function createCounter(initial = 0) {
  const [value$, setValue] = readable(initial);
  return {
    value$,
    increment: () => setValue(value$.value + 1),
  };
}

// Custom equality: defaults to Object.is; pass `false` to always propagate
const items$ = writable([1, 2, 3], { equal: arrayShallowEqual });
```

### Derived State (`computed` / `derived`)

`computed()` tracks any `Readable` accessed via `.value` or `.get()` during evaluation. `derived()` takes a single `Readable` or a tuple of `Readable`s upfront to avoid dynamic tracking overhead:

```ts
import { computed, derived, writable } from "@embra/reactivity";

const price$ = writable(10);
const qty$ = writable(2);
const discount$ = writable(0.1);

const subtotal$ = derived([price$, qty$], (price, qty) => price * qty);

const total$ = computed(() => {
  const subtotal = subtotal$.value;
  return subtotal > 0 ? subtotal * (1 - discount$.value) : 0;
});
```

Both `computed()` and `derived()` are lazy: they only compute when read or observed, and automatically disconnect from upstream dependencies when their last observer leaves.

### Effects, Subscriptions & Scheduling (`watch` / `subscribe` / `until` / `batch`)

- `watch(effect, { sync })` runs immediately, tracks all `Readable`s read during execution, and supports returning a cleanup function.
- `source.subscribe(fn, { sync, immediate })` observes a single `Readable` directly (`immediate` defaults to `true`).
- `until(predicate, { sync, signal })` returns a `Promise` that resolves with the first truthy value returned by `predicate()` (e.g., `until(ready$.get)`), and supports cancellation via `AbortSignal`.
- Both `watch` and `subscribe` run asynchronously in a microtask by default (`sync: false`). Use `flush()` to drain pending asynchronous (and synchronous) notifications immediately, or `source.peek()` / `untrack(fn)` (e.g. `untrack(source$.get)`) to read values inside `computed()` or `watch()` without subscribing to them. Inside either callback, `this.dispose()` disposes the current effect or subscription.

```ts
import { batch, until, watch, writable } from "@embra/reactivity";

const query$ = writable("");

const stopWatch = watch(() => {
  const q = query$.value;
  const controller = new AbortController();
  // ...fetch with controller.signal
  return () => controller.abort();
});

const stopSub = query$.subscribe(
  function (value) {
    if (value === "done") {
      this.dispose();
    }
  },
  { sync: true, immediate: false },
);

batch(() => {
  query$.value = "a";
  query$.value = "ab";
});

await until(() => query$.value === "ab");
```

### Ownership & Lifecycle (`Owned<T>`)

Every `writable`, `readable`, `computed`, `derived`, and reactive collection returns an `Owned<T>` with a `dispose()` method (and `[Symbol.dispose]` for `using` declarations) for explicit lifecycle control when needed. `Owned<T>` is a zero-cost type-level boundary—passing a node as `Readable<T>` or `Writable<T>` across module boundaries hides `dispose()` without creating any runtime wrapper:

```ts
const source$ = writable(42);
const doubled$ = derived(source$, (n) => n * 2);

source$.dispose();
source$.value; // 42 (preserved as a frozen input)
doubled$.value; // 84

// In development builds, writing to a disposed source throws an error
// that includes the stack trace of the original dispose() call:
// source$.value = 100;
```

### Reactive Collections (`reactiveList` / `reactiveMap` / `reactiveSet`)

Reactive collections provide tracked reads, a `.$` `Readable` representing the collection itself, and `onDisposeValue` to clean up owned items when they are removed, overwritten, cleared, or when the collection is disposed:

```ts
import { derived, reactiveList, writable } from "@embra/reactivity";

const todos = reactiveList([writable("Learn @embra/reactivity")]);

// `.get(index)` is tracked inside computed/watch; `.$` can be passed to derived/subscribe
const count$ = derived(todos.$, (list) => list.length);

const stopCleanup = todos.onDisposeValue((item) => {
  item.dispose();
});

todos.push(writable("Build an app"));
todos.shift(); // Automatically disposes the removed writable via onDisposeValue

stopCleanup();
```

`reactiveMap` and `reactiveSet` follow the same pattern with `.$` and `onDisposeValue`.

## React Integration (`@embra/reactivity/react`)

Use `useValue()` to subscribe a component to a `Readable` (defaults to `sync: true` so controlled inputs and immediate UI updates stay in sync), or `<Reactive>` to isolate re-renders to a small subtree:

```tsx
import { writable } from "@embra/reactivity";
import { Reactive, useValue } from "@embra/reactivity/react";

const count$ = writable(0);

function Counter() {
  const count = useValue(count$);
  return <button onClick={() => count$.set(count + 1)}>{count}</button>;
}

function IsolatedCounter() {
  return (
    <div>
      <Reactive>{() => <span>Count: {count$.value}</span>}</Reactive>
    </div>
  );
}
```

Additional hooks exported by `@embra/reactivity/react`: `useWritable`, `useReadable`, `useComputed`, `useComputedValue`, `useDerived`, `useDerivedValue`, and `useWatch`. See the [API Reference](https://embrajs.github.io/reactivity) for details.

## Debugging (`@embra/reactivity/debug`)

`@embra/reactivity/debug` emits structured snapshots and deterministic plain-text timelines (timestamps are off by default in `record()`), allowing both test suites and AI agents to inspect reactive graphs without a browser UI. For interactive browser debugging, `customFormatter()` registers a Chrome DevTools custom object formatter.

```ts
import { computed, writable } from "@embra/reactivity";
import { customFormatter, formatTree, getDependencyTree, inspect, record, spy, trace } from "@embra/reactivity/debug";

// Enable Chrome DevTools custom object formatter
customFormatter();

const a$ = writable(1, { name: "a" });
const b$ = computed(() => a$.value * 2, { name: "b" });

// Non-intrusive snapshot (does not trigger computation or tracking)
console.log(inspect(b$));
console.log(formatTree(getDependencyTree(b$)));

// Trace a specific node or spy on all graph activity (dev build only; no-ops in prod)
const untrace = trace(b$);
const unspy = spy({ filter: "b" });

// Record events and stats during an action
const result = record(() => {
  a$.value = 2;
});
console.log(result.text, result.stats);

untrace();
unspy();
```

## Design Contracts

- **`computed`, `derived`, and `equal` callbacks must be read-only**: Do not write to reactive state inside derivations or equality comparators.
- **Acyclic dependency graph**: Cycles throw immediately when detected.
- **Fail-fast batching**: Errors thrown in computations, comparators, effects, or `batch()` abort the current batch/flush; dispose and recreate affected nodes and effects rather than reusing a failed graph.
- **No writes after disposal**: Never write to a disposed source node or collection.

## Documentation

Full API documentation is available at [embrajs.github.io/reactivity](https://embrajs.github.io/reactivity).

## License

MIT @ [embrajs](https://github.com/embrajs)
