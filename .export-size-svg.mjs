import { defineConfig } from "export-size-svg";

import mangleCache from "./mangle-cache.json" with { type: "json" };

export default defineConfig({
  title: "@embra/reactivity",
  out: "./docs/assets",
  esbuildOptions: {
    sourcesContent: false,
    define: {
      __DEV__: "false",
    },
    mangleProps: /[^_]_$/,
    mangleQuoted: true,
    mangleCache,
  },
  svg: {
    cardWidth: 400,
    theme: {
      titleColor: "#fb4c1bf7",
      progressColor: "#fb4a1b",
      progressTrackColor: "#fb4c1b37",
    },
  },
  exports: [
    {
      title: "core",
      code: "export { readable, writable, computed, watch } from './src/reactivity.ts'",
    },
    {
      title: "collections",
      code: "export * from './src/collections/index.ts'",
      externals: ["../constants", "../reactivity", "../runtime"],
    },
    {
      title: "react",
      code: "export * from './src/react/index.ts'",
      externals: ["@embra/reactivity", "react"],
    },
  ],
});
