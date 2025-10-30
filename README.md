# [@embra/reactivity](https://github.com/embrajs/reactivity)

<p align="center">
  <img width="200" src="https://raw.githubusercontent.com/embrajs/reactivity/main/assets/embra.svg">
</p>

[![Docs](https://img.shields.io/badge/Docs-read-%23fdf9f5)](https://embrajs.github.io/reactivity)
[![Build Status](https://github.com/embrajs/reactivity/actions/workflows/build.yml/badge.svg)](https://github.com/embrajs/reactivity/actions/workflows/build.yml)
[![npm-version](https://img.shields.io/npm/v/@embra/reactivity.svg)](https://www.npmjs.com/package/@embra/reactivity)
[![Coverage Status](https://embrajs.github.io/reactivity/coverage-badges/@embra/reactivity.svg)](https://embrajs.github.io/reactivity/coverage/)

A lightweight, composable and explicit reactivity system.

## Features

### ⚡ Plain reactivity. No proxies, no magic.

It does not convert the value with `Object.defineProperty` nor `Proxy`. Keeping everything as plain JavaScript value makes it easier to work with other libraries and easier for the JavaScript engine to optimize.

```ts
import { writable, readable, type Readable } from "@embra/reactivity";

const count$ = writable(0);
count$.set(1);

const [count2$, setCount] = readable(0);
setCount(1);
```

### 🔍 Explicit reactivity. No hidden dependencies, no surprises.

Unlike signal-based libraries, `@embra/reactivity` does not automatically track dependencies. You explicitly define what to watch and how to react to changes. This is easier to reason about dependencies and also reduce the cost of complex implicit dependency calculation.

With React hook-like API, computations can be pure functions which is more compatible with general non-reactive functions.

```ts
import { writable, derive } from "@embra/reactivity";

const count$ = writable(0);

const isPositive = (value: number): boolean => value > 0;

const positiveCount$ = derive(count$, isPositive);
```

Dynamic dependencies can be collected using `get` in `compute` or `watch`.

```ts
import { writable, compute, watch } from "@embra/reactivity";

const count$ = writable(0);
const doubleCount$ = compute(get => get(count$) * 2);

watch(get => {
  const count = get(count$);
  console.log(`Count is ${count}, double is ${get(doubleCount$)}`);
});
```

### 🛡️ Zero-cost ownership model. Type-safe lifecycle management.

In practice, one of the biggest problems we encountered with reactivity libraries is the lifecycle management of reactive values. In `@embra/reactivity`, the reactive dependencies are weakly referenced, so generally you don't need to manually dispose of them. However, explicit lifecycle management is still a good practice to avoid unexpected behaviors.

`@embra/reactivity` provides a zero-cost ownership model that allows you to create reactive values with explicit ownership.

By default, created reactive values are with type `OwnedReadable` or `OwnedWritable`, which exposes a `dispose()` method to clear their subscribers. When passing the reactive value to other modules, you can use `Readable` or `Writable` types to hide the `dispose()` method, ensuring that the value is not disposed of accidentally.

```ts
import { writable, readable, type Readable, type OwnedWritable } from "@embra/reactivity";

const count$: OwnedWritable<number> = writable(0);
count$.set(1);

// Hide the setter by typing
function logCount(count$: Readable<number>) {
  count$.subscribe(console.log);

  // @ts-expect-error
  count$.set(2);
}
logCount(count$);

// Hide the setter in runtime
const [count2$, setCount] = readable(0);
setCount(1);

// @ts-expect-error
count2$.set(2);
```

### 🧩 Flexible abstractions of state and actions.

In the days of Flux reducer model, we often used a single store to hold the state and actions to mutate the state. This was nice for reasoning about the state, but it also introduced a lot of boilerplate code.

Later on, a pattern with state and action glued together was introduced, like `redux-actions`. `@embra/reactivity` takes this a step further by providing a simple and flexible abstraction of state and actions.

In the following example, we create a Writable `count$` which looks like a `Writable<number>`, but internally it is derived from a larger application state `appState$`. This allows other modules to depend on a `Writable<number>` without knowing the details of the application state.

```ts
import { writable, derive, toWritable } from "@embra/reactivity";
import { trace } from "@embra/reactivity/debug";

const appState$ = writable({
  count: 0,
  user: null,
});

const count$ = toWritable(
  derive(appState$, state => state.count),
  count => appState$.set({ ...appState$.value, count }),
);

// when debugging, you can trace the reactive value
trace(count$);
```

### ⏳ Scheduler mechanism for controlled updates.

`@embra/reactivity` includes a scheduler mechanism and built-in schedulers that lets you control when reactive updates are processed.
This is useful for batching updates and deferring computations.

```ts
import { writable, MicrotaskScheduler } from "@embra/reactivity";

const rapidChangeCount$ = writable(0);

rapidChangeCount$.reaction(console.log, MicrotaskScheduler);

count$.set(1);
count$.set(2);

await Promise.resolve();
// Logs "2" once after a microtask tick, reducing unnecessary computations.
```

You can also provide your owned custom scheduler function easily.

```ts
import { writable, asyncScheduler } from "@embra/reactivity";

const MicrotaskScheduler = asyncScheduler(flush => Promise.resolve().then(flush));
const AnimationFrameScheduler = asyncScheduler(requestAnimationFrame);
```

### 🏗️ Framework agnostic. First-class support for React.

`@embra/reactivity` is designed to be framework agnostic. It can be used with any framework or library that supports JavaScript. It also provides first-class support for React.

```tsx
import { writable } from "@embra/reactivity";
import { useValue, useDerived, useCombined } from "@embra/reactivity/react";

const count$ = writable(0);

function Counter({ count$ }) {
  const count = useValue(count$);
  const countDouble = useDerived(count$, count => count * 2);
  return (
    <div>
      <button onClick={() => count$.set(count - 1)}>-</button>
      <span>{count}</span>
      <button onClick={() => count$.set(count + 1)}>+</button>
      <span>{countDouble}</span>
    </div>
  );
}
```

### 📦 Small bundle size. Focused on performance and simplicity.

![export size](https://embrajs.github.io/reactivity/assets/export-size.svg)

## Install

```bash
npm add @embra/reactivity
```

## Debugging

### trace

`@embra/reactivity` provides a `trace()` function to help debug reactive values and watches. It tracks value and dependency changes and logs them to the console.

```js
import { writable, watch } from "@embra/reactivity";
import { trace } from "@embra/reactivity/debug";

const count$ = writable(0);

// trace a reactive value
trace(count$);

// trace a watch function
watch(trace(get => get(count$)));

count$.set(1);
```

### Chrome Devtools Custom Formatter

`@embra/reactivity` supports Chrome DevTools [custom formatters](https://www.mattzeunert.com/2016/02/19/custom-chrome-devtools-object-formatters.html). You may enable it by checking the "Enable custom formatters" option in the "Console" section of DevTools general settings.

It is enabled in development by default. You can also enable it manually by calling `customFormatter()`.

```js
import { customFormatter } from "@embra/reactivity/debug";
customFormatter();
```
