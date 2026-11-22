import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  computed,
  derived,
  isReadable,
  isWritable,
  type Readable,
  type ReadableValue,
  type ReadableValues,
  readable,
  type Writable,
  writable,
} from "../src";
import { CONTRACT_SYMBOL, CONTRACT_VERSION } from "../src/constants";

describe("readable predicates", () => {
  it("recognizes each node kind without evaluating it", () => {
    const source = writable(1);
    const [readonly] = readable(2);
    const compute = vi.fn(() => source.get());
    const derive = vi.fn((value: number) => value);
    const dynamic = computed(compute);
    const fixed = derived(source, derive);

    for (const value of [source, readonly, dynamic, fixed]) {
      expect(isReadable(value)).toBe(true);
    }
    expect(isWritable(source)).toBe(true);
    expect(isWritable(readonly)).toBe(false);
    expect(isWritable(dynamic)).toBe(false);
    expect(isWritable(fixed)).toBe(false);
    expect(compute).not.toHaveBeenCalled();
    expect(derive).not.toHaveBeenCalled();
  });

  it("rejects ordinary, array and function providers", () => {
    const source = writable(1);
    const providers = [{ $: source }, Object.assign([], { $: source }), Object.assign(() => {}, { $: source })];

    for (const provider of providers) {
      expect(isReadable(provider)).toBe(false);
      expect(isWritable(provider)).toBe(false);
    }
  });

  it("allows a readable to also provide another readable", () => {
    const source = Object.assign(writable(1), { $: writable("a") });

    expect(isReadable(source)).toBe(true);
    expect(isWritable(source)).toBe(true);
    expectTypeOf<ReadableValue<typeof source>>().toEqualTypeOf<number>();
  });

  it("preserves classifications after disposal", () => {
    const source = writable(1);
    const [readonly] = readable(2);
    const dynamic = computed(() => source.get());
    const fixed = derived(source, (value) => value);

    for (const value of [source, readonly, dynamic, fixed]) {
      value.dispose();
      expect(isReadable(value)).toBe(true);
    }
    expect(isWritable(source)).toBe(true);
    expect(isWritable(readonly)).toBe(false);
    expect(isWritable(dynamic)).toBe(false);
    expect(isWritable(fixed)).toBe(false);
  });

  it.each([
    null,
    undefined,
    0,
    "",
    true,
    0n,
    Symbol(),
    () => {},
    [],
    {},
    { value: 1 },
    { $: 1 },
  ])("rejects non-readables: %s", (value) => {
    expect(isReadable(value)).toBe(false);
    expect(isWritable(value)).toBe(false);
  });

  it("rejects method-shaped objects and incompatible contract versions", () => {
    const get = vi.fn(() => 1);
    const set = vi.fn();
    const contract = Symbol.for("@embra/reactivity/contract");

    for (const value of [
      { get, set },
      { [contract]: "v0", get, set },
      { [contract]: true, get, set },
    ]) {
      expect(isReadable(value)).toBe(false);
      expect(isWritable(value)).toBe(false);
    }
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("treats a contract-compatible readable without a set property as non-writable", () => {
    const readOnlyLike = { [CONTRACT_SYMBOL]: CONTRACT_VERSION, get: () => 1 };
    expect(isReadable(readOnlyLike)).toBe(true);
    expect(isWritable(readOnlyLike)).toBe(false);
  });

  it("narrows unknown values and extracts readable value types", () => {
    const source: unknown = writable(1);
    if (isReadable<number>(source)) expectTypeOf(source).toEqualTypeOf<Readable<number>>();
    if (isWritable<number>(source)) expectTypeOf(source).toEqualTypeOf<Writable<number>>();
    expectTypeOf<ReadableValue<Readable<string>>>().toEqualTypeOf<string>();
    expectTypeOf<ReadableValue<{ $: Readable<string> }>>().toEqualTypeOf<never>();
    expectTypeOf<ReadableValues<readonly [Readable<number>, Readable<string>]>>().toEqualTypeOf<
      readonly [number, string]
    >();
  });

  it("preserves known value types when narrowing nullable inputs", () => {
    const source = null as Readable<number> | null;
    if (isReadable(source)) expectTypeOf(source).toEqualTypeOf<Readable<number>>();
    if (isWritable(source)) expectTypeOf(source).toEqualTypeOf<Writable<number>>();
  });
});
