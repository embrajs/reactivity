import { describe, expect, it, vi } from "vitest";

import { asyncScheduler } from "../../src";

describe("asyncScheduler", () => {
  it("should finish flushing if one of the tasks throws", async () => {
    const consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => void 0);

    const scheduler = asyncScheduler(flush => Promise.resolve().then(flush));

    const spies = [
      vi.fn(),
      vi.fn(() => {
        throw new Error("Test error");
      }),
      vi.fn(),
    ];

    for (const spy of spies) {
      scheduler({ schedulerTask_: spy });
    }

    expect(consoleErrorMock).toBeCalledTimes(0);
    expect(spies[0]).toBeCalledTimes(0);
    expect(spies[1]).toBeCalledTimes(0);
    expect(spies[2]).toBeCalledTimes(0);

    await Promise.resolve();

    expect(consoleErrorMock).toBeCalledTimes(1);
    expect(spies[0]).toBeCalledTimes(1);
    expect(spies[1]).toBeCalledTimes(1);
    expect(spies[2]).toBeCalledTimes(1);

    consoleErrorMock.mockRestore();
  });
});
