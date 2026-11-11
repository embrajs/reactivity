import { expect, it, vi } from "vitest";
import { batch, computed, derived, watch, writable } from "../src";

it.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])("preserves initially undefined outputs and consumer cleanup, fixed=%s sync=%s", async (fixed, sync) => {
  const input = writable<number | undefined>(undefined);
  const child = fixed ? derived(input, (value) => value) : computed(() => input.get());
  // A static parent connects its child before that child's first evaluation.
  const parent = derived(child, (value) => value ?? -1);
  const seen: number[] = [];
  const subscribed: (number | undefined)[] = [];
  let cleanups = 0;
  const stopWatch = watch(
    () => {
      seen.push(parent.get());
      return () => {
        cleanups++;
      };
    },
    { sync },
  );
  const stopSource = child.subscribe(
    (value) => {
      subscribed.push(value);
    },
    { sync, immediate: false },
  );
  try {
    expect(seen).toEqual([-1]);
    expect(subscribed).toEqual([]);
    batch(() => {
      input.set(1);
      input.set(undefined);
    });
    await Promise.resolve();
    expect(seen).toEqual([-1]);
    expect(subscribed).toEqual([]);
    expect(cleanups).toBe(0);
    input.set(2);
    await Promise.resolve();
    expect(seen).toEqual([-1, 2]);
    expect(subscribed).toEqual([2]);
    expect(cleanups).toBe(1);
    input.set(undefined);
    await Promise.resolve();
    expect(seen).toEqual([-1, 2, -1]);
    expect(subscribed).toEqual([2, undefined]);
    expect(cleanups).toBe(2);
  } finally {
    stopSource();
    stopWatch();
    parent.dispose();
    child.dispose();
    input.dispose();
  }
  expect(cleanups).toBe(3);
});

it("protects custom equality from an absent initial cached output", () => {
  const input = writable(0);
  const equal = vi.fn((previous: { id: number }, next: { id: number }) => previous.id === next.id);
  const output = computed(() => ({ id: input.get() }), { equal });
  try {
    expect(output.get()).toEqual({ id: 0 });
    expect(equal).not.toHaveBeenCalled();
    input.set(1);
    expect(output.get()).toEqual({ id: 1 });
    expect(equal).toHaveBeenCalledExactlyOnceWith({ id: 0 }, { id: 1 });
  } finally {
    output.dispose();
    input.dispose();
  }
});
