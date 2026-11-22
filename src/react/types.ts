import type { EqualityConfig, Readable, ReadableOptions } from "@embra/reactivity";
import type { ReactNode } from "react";

/**
 * Unwraps the value type if `T` is a {@link Readable}, otherwise returns `T` as-is.
 */
export type UnwrapReadable<T> = T extends Readable<infer V> ? V : T;

/**
 * Options for {@link useValue}.
 */
export interface UseValueOptions {
  /**
   * Deliver updates synchronously after the current batch instead of in a microtask.
   * Defaults to `true`.
   */
  sync?: boolean;
}

/**
 * Options for {@link useComputedValue}.
 */
export interface UseComputedValueOptions<T> extends ReadableOptions<T>, UseValueOptions {}

/**
 * Options for {@link useDerivedValue}.
 */
export interface UseDerivedValueOptions<T> extends ReadableOptions<T>, UseValueOptions {}

/**
 * Props for {@link Reactive}.
 */
export interface ReactiveProps {
  /** Render function tracked reactively, or a {@link Readable} of `ReactNode`. */
  children: (() => ReactNode) | Readable<ReactNode>;
  /**
   * Deliver updates synchronously after the current batch instead of in a microtask.
   * Defaults to `true`.
   */
  sync?: boolean;
  /** Equality configuration for change detection. Defaults to `Object.is`. */
  equal?: EqualityConfig<ReactNode>;
  /** Optional debug label for the internal computed node. */
  name?: string;
}
