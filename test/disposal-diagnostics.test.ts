import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, derived, writable } from "../src";

type DisposalDiagnostics = { __dev_disposed_at?: Error | null };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each([
  { name: "writable", create: () => writable(0) },
  { name: "computed", create: () => computed(() => 0) },
  { name: "derived", create: () => derived([], () => 0) },
])("$name disposal diagnostics", ({ create }) => {
  it("records the first disposal call site in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const node = create();
    const diagnostics = node as typeof node & DisposalDiagnostics;
    expect(node.get()).toBe(0);
    expect(diagnostics.__dev_disposed_at).toBeNull();

    function disposeAtOriginalLocation() {
      node.dispose();
    }
    disposeAtOriginalLocation();
    const original = diagnostics.__dev_disposed_at;
    expect(original).toBeInstanceOf(Error);
    expect(original?.stack).toContain("disposeAtOriginalLocation");
    node.dispose();
    expect(diagnostics.__dev_disposed_at).toBe(original);
    expect(node.get()).toBe(0);
  });

  it("does not attach disposal history in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const node = create();
    node.dispose();
    expect(Object.hasOwn(node, "__dev_disposed_at")).toBe(false);
  });
});

it("rejects a development write even when disposal history was not captured", () => {
  vi.stubEnv("NODE_ENV", "production");
  const source = writable(0);
  source.dispose();
  vi.stubEnv("NODE_ENV", "development");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => source.set(1)).toThrow("disposed");
  expect(source.get()).toBe(0);
  expect(log).not.toHaveBeenCalled();
});

it("reports the original disposal location when a computation writes a disposed source", () => {
  vi.stubEnv("NODE_ENV", "development");
  const source = writable(0);
  source.dispose();
  const original = (source as typeof source & DisposalDiagnostics).__dev_disposed_at;
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const output = computed(() => {
    source.set(1);
    return 0;
  });
  try {
    expect(() => output.get()).toThrow("disposed");
    expect(log).toHaveBeenCalledWith("ValueNode disposed at:", original);
    expect(source.get()).toBe(0);
  } finally {
    output.dispose();
  }
});
