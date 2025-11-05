import { type ComputeFn } from "../compute";
import { type ReadableProvider, type Get, type Readable } from "../interface";
import { isReadable, isWritable } from "../utils";
import { type WatchEffect } from "../watch";

export interface TraceConfig {
  name?: string;
  /** @default true */
  printStack?: boolean;
  /** @default true */
  defaultExpand?: boolean;
}

export interface Trace {
  <T extends Readable>($: T, config?: TraceConfig): T;
  (effect: WatchEffect, config?: TraceConfig): WatchEffect;
  (fn: ComputeFn, config?: TraceConfig): ComputeFn;
}

/**
 * Console logs trace information about the provided Readable or WatchEffect.
 * @example
 * ```ts
 * import { writable, watch } from "@embra/reactivity";
 * import { trace } from "@embra/reactivity/debug";
 * const count$ = writable(0);
 *
 * trace(count$);
 *
 * watch(() => count$.value++);
 *
 * count$.set(1);
 * ```
 */
export const trace: Trace = (x: any, config?: TraceConfig): any => {
  if (isReadable(x)) {
    return traceReadable(x, config);
  }
  if (isReadable(x?.$)) {
    return traceReadableProvider(x, config);
  }
  if (typeof x === "function") {
    return traceWatch(x as ComputeFn | WatchEffect, config);
  }
  throw new TypeError("trace expects a Readable, WatchEffect, or ComputeFn as the first argument");
};

interface Info {
  value: any;
  version: number;
}

class Deps {
  public oldDeps = new Map<Readable, Info>();
  public newDeps = new Map<Readable, Info>();

  private readonly added: [Readable, Info][] = [];
  private readonly updated: [Readable, Info][] = [];
  private readonly unchanged: [Readable, Info][] = [];
  private readonly removed: [Readable, Info][] = [];

  public print(): void {
    for (const [dep, info] of this.newDeps) {
      const oldInfo = this.oldDeps.get(dep);
      if (oldInfo) {
        if (oldInfo.version !== info.version) {
          this.updated.push([dep, info]);
        } else {
          this.unchanged.push([dep, info]);
        }
      } else {
        this.added.push([dep, info]);
      }
    }

    for (const [dep, info] of this.oldDeps) {
      if (!this.newDeps.has(dep)) {
        this.removed.push([dep, info]);
      }
    }

    for (const [dep, info] of this.added) {
      console.log(`\x1b[32m(+)\x1b[0m ${this.getDepName(dep)} ->`, info.value);
    }
    for (const [dep, info] of this.updated) {
      console.log(
        `\x1b[33m(*)\x1b[0m ${this.getDepName(dep)} ->`,
        info.value,
        `<- previous:`,
        this.oldDeps.get(dep)?.value,
      );
    }
    for (const [dep, info] of this.unchanged) {
      console.log(`\x1b[37m(=) ${this.getDepName(dep)}\x1b[0m ->`, info.value);
    }
    for (const [dep, info] of this.removed) {
      console.log(`\x1b[31m(-)\x1b[0m \x1b[9m${this.getDepName(dep)}\x1b[0m ->`, info.value);
    }

    this.added.length = this.updated.length = this.unchanged.length = this.removed.length = 0;
  }

  private depNameIndex = 1;
  private readonly depNames = new WeakMap<Readable, string>();
  private getDepName(dep: Readable): string {
    if (this.depNames.has(dep)) {
      return this.depNames.get(dep)!;
    }
    const depType = isWritable(dep) ? "Writable" : isReadable(dep) ? "Readable" : "Unknown";
    let name =
      dep.name ||
      (this.depNameIndex <= 20 ? String.fromCodePoint(9311 + this.depNameIndex++) : `${this.depNameIndex++}`);
    name = `${depType}(${name})`;
    this.depNames.set(dep, name);
    return name;
  }
}

const traceReadable = <T extends Readable>($: T, config?: TraceConfig): T => {
  const deps = new Deps();
  const $type = isWritable($) ? "Writable" : "Readable";
  const traceLocation = new Error("LocationDebugError");
  let lastValue: any = traceLocation;

  $.subscribe(() => {
    ((config?.defaultExpand ?? true) ? console.group : console.groupCollapsed)(
      `\x1b[36m[embra]\x1b[0m trace ${$type}${$.name ? `(\x1b[33m${$.name}\x1b[0m)` : ""}${config?.name ? `: ${config.name}` : ""}`,
    );

    if (config?.printStack ?? true) {
      console.groupCollapsed("trace location");
      console.log(traceLocation);
      console.groupEnd();

      console.groupCollapsed(`effect location`);
      console.trace();
      console.groupEnd();
    }

    if (lastValue === traceLocation) {
      console.log($.value);
    } else {
      console.log($.value, "<- previous:", lastValue);
    }
    lastValue = $.value;

    if ($.deps_) {
      for (const dep of $.deps_.keys()) {
        deps.newDeps.set(dep, { value: dep.value, version: dep.version });
      }

      deps.print();

      [deps.oldDeps, deps.newDeps] = [deps.newDeps, deps.oldDeps];
      deps.newDeps.clear();
    } else {
      deps.oldDeps.clear();
      deps.newDeps.clear();
    }

    console.groupEnd();
  });

  return $;
};

const traceReadableProvider = <T extends ReadableProvider>($: T, config?: TraceConfig): T => {
  const $type =
    $ instanceof Set
      ? "ReactiveSet"
      : $ instanceof Map
        ? "ReactiveMap"
        : $ instanceof Array
          ? "ReactiveArray"
          : "ReadableProvider";
  // const deps = new Deps();
  const traceLocation = new Error("LocationDebugError");
  let lastValue: any = traceLocation;

  $.$.subscribe(() => {
    ((config?.defaultExpand ?? true) ? console.group : console.groupCollapsed)(
      `\x1b[36m[embra]\x1b[0m trace ${$type}${config?.name ? `: ${config.name}` : ""}`,
    );

    if (config?.printStack ?? true) {
      console.groupCollapsed("trace location");
      console.log(traceLocation);
      console.groupEnd();

      console.groupCollapsed(`effect location`);
      console.trace();
      console.groupEnd();
    }

    const value =
      $ instanceof Set ? new Set($) : $ instanceof Map ? new Map($) : $ instanceof Array ? [...$] : $.$.value;

    if (lastValue === traceLocation) {
      console.log(value);
    } else {
      console.log(value, "<- previous:", lastValue);
    }
    lastValue = value;

    // if ($.$.deps_) {
    //   for (const dep of $.$.deps_.keys()) {
    //     deps.newDeps.set(dep, { value: dep.value, version: dep.version });
    //   }

    //   deps.print();

    //   [deps.oldDeps, deps.newDeps] = [deps.newDeps, deps.oldDeps];
    //   deps.newDeps.clear();
    // } else {
    //   deps.oldDeps.clear();
    //   deps.newDeps.clear();
    // }

    console.groupEnd();
  });

  return $;
};

const traceWatch = <T extends WatchEffect | ComputeFn>(effect: T, config?: TraceConfig): T => {
  const deps = new Deps();
  const traceLocation = new Error("TraceLocationDebugError");

  return ((get: Get, ...args: [any]): any => {
    const myGet: Get = ($: any) => {
      if (isReadable($)) {
        deps.newDeps.set($, { value: $.value, version: $.version });
      } else if (isReadable($?.$)) {
        deps.newDeps.set($.$, { value: $.$.value, version: $.$.version });
      }
      return get($);
    };

    const type = typeof args[0] === "function" ? "watch" : "compute";
    const start = performance.now();
    const effectResult = effect(myGet, ...args);
    const time = (performance.now() - start).toFixed(2);

    ((config?.defaultExpand ?? true) ? console.group : console.groupCollapsed)(
      `\x1b[36m[embra]\x1b[0m trace ${type}${effect.name ? `(\x1b[33m${effect.name}\x1b[0m)` : ""}${config?.name ? `: ${config.name}` : ""}`,
    );

    if (config?.printStack ?? true) {
      console.groupCollapsed("trace location");
      console.log(traceLocation);
      console.groupEnd();

      console.groupCollapsed(`effect executed in ${time} ms`);
      console.trace();
      console.groupEnd();
    } else {
      console.log(`effect executed in ${time} ms`);
    }

    deps.print();

    console.groupEnd();

    [deps.oldDeps, deps.newDeps] = [deps.newDeps, deps.oldDeps];
    deps.newDeps.clear();

    return effectResult;
  }) as T;
};
