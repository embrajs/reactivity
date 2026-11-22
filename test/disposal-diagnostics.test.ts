import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { batch, computed, derived, watch, writable } from "../src";
import { setDevMode } from "./setup";

type DisposalDiagnostics = { __dev_disposed_at?: Error | null };

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  { name: "writable", create: () => writable(0) },
  { name: "computed", create: () => computed(() => 0) },
  { name: "derived", create: () => derived([], () => 0) },
])("$name disposal diagnostics", ({ create }) => {
  it("records the first disposal call site in development", () => {
    setDevMode(true);
    const node = create();
    const diagnostics = node as typeof node & DisposalDiagnostics;
    expect(node.get()).toBe(0);
    expect(diagnostics.__dev_disposed_at).toBeUndefined();

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
    setDevMode(false);
    const node = create();
    node.dispose();
    expect(Object.hasOwn(node, "__dev_disposed_at")).toBe(false);
  });
});

it("rejects a development write even when disposal history was not captured", () => {
  setDevMode(false);
  const source = writable(0);
  source.dispose();
  setDevMode(true);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => source.set(1)).toThrow("disposed");
  expect(source.get()).toBe(0);
  expect(log).not.toHaveBeenCalled();
});

it("reports the original disposal location when a computation writes a disposed source", () => {
  setDevMode(true);
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

it("resolves development and default ESM conditional exports without process.env", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (!existsSync(new URL("../dist/index.mjs", import.meta.url))) {
    execFileSync(process.execPath, ["scripts/build.ts"], { cwd: root });
  }

  const runNode = (args: string[], code: string) =>
    execFileSync(process.execPath, [...args, "--input-type=module", "-e", code], {
      cwd: root,
      encoding: "utf8",
    }).trim();

  expect(
    runNode(
      [],
      `
      import { createRequire } from "node:module";
      import * as prod from "@embra/reactivity";
      import * as dev from "./dist/index.dev.mjs";
      delete globalThis.process;
      const source = prod.writable(1);
      const doubled = dev.computed(() => source.get() * 2);
      source.set(3);
      if (doubled.get() !== 6) throw new Error("shared runtime mismatch");
      source.dispose();
      doubled.dispose();
      const require = createRequire(import.meta.url);
      const requiredModule = require("@embra/reactivity");
      console.log(JSON.stringify({
        prodHasDiagnostics: Object.hasOwn(source, "__dev_disposed_at"),
        devHasDiagnostics: Object.hasOwn(doubled, "__dev_disposed_at"),
        sameExport: requiredModule.writable === prod.writable,
      }));
    `,
    ),
  ).toBe(JSON.stringify({ prodHasDiagnostics: false, devHasDiagnostics: true, sameExport: true }));

  expect(
    runNode(
      ["--conditions=development"],
      `
      import { writable } from "@embra/reactivity";
      delete globalThis.process;
      const source = writable(0);
      source.dispose();
      console.log(Object.hasOwn(source, "__dev_disposed_at"));
    `,
    ),
  ).toBe("true");
});

describe("production mode behavior", () => {
  it("handles batch errors, unchanged/throwing computeds, throwing watches, and async flushes without __DEV__", async () => {
    setDevMode(false);

    expect(() =>
      batch(() => {
        throw new Error("prod-batch-err");
      }),
    ).toThrow("prod-batch-err");

    const source = writable(1);
    const clamped = computed(() => (source.get() > 0 ? 1 : 0));
    expect(clamped.get()).toBe(1);
    source.set(2);
    expect(clamped.get()).toBe(1);

    const broken = computed(() => {
      if (source.get() > 2) {
        throw new Error("prod-compute-err");
      }
      return 0;
    });
    expect(broken.get()).toBe(0);
    source.set(3);
    expect(() => broken.get()).toThrow("prod-compute-err");

    expect(() =>
      watch(() => {
        throw new Error("prod-watch-err");
      }),
    ).toThrow("prod-watch-err");

    const asyncSource = writable(0);
    const seen: number[] = [];
    const stopSub = asyncSource.subscribe((v) => seen.push(v), { immediate: false });
    asyncSource.set(10);
    await Promise.resolve();
    expect(seen).toEqual([10]);

    stopSub();
    broken.dispose();
    clamped.dispose();
    source.dispose();
    asyncSource.dispose();
  });
});
