import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    coverage: {
      include: ["src/**"],
      exclude: ["src/debug/**"],
      reporter: ["html", "text", "json-summary"],
    },
    execArgv: ["--expose-gc"],
  },
});
