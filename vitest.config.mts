import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@embra/reactivity": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
    },
  },
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
