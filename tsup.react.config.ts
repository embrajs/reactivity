import { defineConfig } from "tsup";

import mangleCache from "./mangle-cache.json";

export default defineConfig({
  clean: false,
  dts: true,
  entry: {
    react: "src/react/index.ts",
  },
  esbuildOptions: options => {
    options.sourcesContent = false;
    options.mangleProps = /[^_]_$/;
    options.mangleCache = mangleCache;
  },
  format: ["cjs", "esm"],
  minify: Boolean(process.env.MINIFY),
  sourcemap: true,
  splitting: false,
  target: "esnext",
  treeshake: true,
  esbuildPlugins: [
    {
      name: "replace-imports",
      setup(build) {
        build.onResolve({ filter: /^@embra\/reactivity$/ }, () => {
          return {
            path: build.initialOptions.define?.TSUP_FORMAT === '"cjs"' ? "." : "./index.mjs",
            external: true,
          };
        });
      },
    },
  ],
});
