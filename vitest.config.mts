import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    coverage: {
      include: ["src/**"],
      exclude: ["src/dev/**"],
      reporter: ["html", "text", "json-summary"],
    },
    poolOptions: {
      forks: {
        execArgv: ["--expose-gc"],
      },
    },
  },
});
