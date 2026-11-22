import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**"],
      reporter: ["html", "text", "json-summary"],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    execArgv: ["--expose-gc"],
    setupFiles: ["./test/setup.ts"],
  },
});
