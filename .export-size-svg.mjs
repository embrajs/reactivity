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
      title: "{ readable, writable, computed, watch } (core)",
      code: "export { readable, writable, computed, watch } from './src'",
    },
    {
      title: "{ reactiveList, reactiveMap, reactiveSet } (collections)",
      code: "export { reactiveList, reactiveMap, reactiveSet } from './src/collections'",
      externals: ["../constants", "../reactivity", "../runtime"],
    },
    {
      title: "{ derived, batch, flush, untrack, isReadable, isWritable }",
      code: "export { derived, batch, flush, untrack, isReadable, isWritable } from './src'",
      externals: ["./node", "./constants", "./runtime"],
    },
    {
      title: "React Hooks and Components (@embra/reactivity/react)",
      code: "export * from './src/react'",
      externals: ["@embra/reactivity", "react"],
    },
  ],
});
