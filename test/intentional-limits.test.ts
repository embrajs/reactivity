import { describe, expect, it } from "vitest";
import { computed, derived, writable } from "../src";

// These are deliberate contract boundaries, not pending fixes.
// Record the unsupported behavior, its cost rationale, and the caller's supported action.
// Incidental failures or leaks are not part of the contract; inexpensive improvements are allowed.
describe("intentional limits", () => {
  describe("automatic collection after a circular dependency failure is not guaranteed", () => {
    // Constraint: dependency graphs must be acyclic; callers dispose nodes after a cycle error.
    // Rationale: tracing failed graphs adds runtime state, graph walks, and temporary allocations.
    // Verify explicit cleanup without requiring collection or retention before disposal.
    it("releases the failed graph when the caller explicitly disposes its nodes", async () => {
      const circular = writable(false);
      const source = writable(0);
      const refs = (() => {
        const first = computed((): number => (circular.get() ? second.get() : source.get()));
        const second = derived(first, (value) => value + 1);
        const stop = first.subscribe(() => {}, { sync: true });

        try {
          expect(() => circular.set(true)).toThrow("loop detected");
        } finally {
          stop();
          first.dispose();
          second.dispose();
        }
        return [new WeakRef(first), new WeakRef(second)];
      })();

      await new Promise<void>((resolve) => setImmediate(resolve));
      globalThis.gc!();
      for (const ref of refs) expect(ref.deref()).toBeUndefined();
      // Keep the upstream roots alive across collection.
      expect(circular.get()).toBe(true);
      expect(source.get()).toBe(0);
    });
  });
});
