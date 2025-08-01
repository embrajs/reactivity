import { describe, expect, it, vi } from "vitest";

import { watch, writable } from "../src";

describe("watch", () => {
  it("should get non-readable", () => {
    const s = writable(123);
    const spy = vi.fn();
    watch(get => {
      spy(get(s) + get(321));
    });
    expect(spy).toBeCalledTimes(1);
    expect(spy).lastCalledWith(444);

    s.value = 42;
    expect(spy).toBeCalledTimes(2);
    expect(spy).lastCalledWith(363);
  });
});
