import { describe, expect, it } from "vitest";

import { combine, writable } from "../src";

describe("combine", () => {
  it("should combine an array of Readables into a single Readable with the array of values", () => {
    const dep1$ = writable(1);
    const dep2$ = writable(2);
    const combined$ = combine([dep1$, dep2$]);

    expect(combined$.value).toEqual([1, 2]);

    dep1$.value = 3;
    expect(combined$.value).toEqual([3, 2]);
  });

  it("should combine an array of Readables into a single Readable with transformed value", () => {
    const dep1$ = writable(1);
    const dep2$ = writable(2);
    const combined$ = combine([dep1$, dep2$], (v1, v2) => v1 + v2);

    expect(combined$.value).toBe(3);

    dep1$.value = 3;
    expect(combined$.value).toBe(5);
  });
});
