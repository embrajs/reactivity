// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { isReadable, writable } from "../../src";
import { useDerive } from "../../src/react";

describe("useDerive", () => {
  it("should get derived value from Readable without transform", () => {
    const v$ = writable(1);
    const { result } = renderHook(() => useDerive(v$));

    expect(isReadable(result.current)).toBe(true);
    expect(result.current.value).toBe(1);

    act(() => v$.set(2));
    expect(result.current.value).toBe(2);
  });
});
