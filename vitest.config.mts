import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**"],
      exclude: ["src/dev/**"],
      reporter: ["html", "text", "lcov"],
    },
    poolOptions: {
      forks: {
        execArgv: ["--expose-gc"],
      },
    },
  },
});
