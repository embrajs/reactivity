import { describe, expect, it } from "vitest";

import { derive, writable } from "../src";

describe("derive", () => {
  it("should derive a new Readable with same value", () => {
    const dep$ = writable(42);
    const derived$ = derive(dep$);

    expect(derived$.value).toBe(dep$.value);

    dep$.value = 100;
    expect(derived$.value).toBe(100);
  });

  it("should derive a new Readable with transformed value", () => {
    const dep$ = writable(42);
    const derived$ = derive(dep$, value => value * 2);

    expect(derived$.value).toBe(84);

    dep$.value = 100;
    expect(derived$.value).toBe(200);
  });
});
