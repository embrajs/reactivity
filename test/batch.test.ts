import { describe, expect, it } from "vitest";

import { batchFlush } from "../src";
import { batchTasks } from "../src/batch";

describe("batch", () => {
  describe("batchFlush", () => {
    it("should do nothing when not in a batch", () => {
      expect(batchTasks).toHaveLength(0);
      batchFlush();
      expect(batchTasks).toHaveLength(0);
    });
  });
});
