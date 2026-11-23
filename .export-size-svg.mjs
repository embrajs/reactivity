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
      title: "import { ... } from '@embra/reactivity'",
      exports: [
        {
          title: "{ readable, writable, computed, watch } (core)",
          code: "export { readable, writable, computed, watch } from './src'",
        },
        {
          title: "{ reactiveList, reactiveMap, reactiveSet } (collections)",
          code: "export { reactiveList, reactiveMap, reactiveSet } from './src/collections'",
          externals: ["../node", "../constants", "../reactivity", "../runtime"],
        },
        {
          title: "{ derived, batch, isReadable, isWritable, untrack, flush }",
          code: "export { derived, batch, isReadable, isWritable, untrack, flush } from './src'",
          externals: ["./node", "./constants", "./runtime"],
        },
        {
          title: "{ until }",
          code: "export { until } from './src'",
          externals: ["./node", "./constants", "./runtime"],
          externalSymbols: ["watch"],
        },
      ],
    },
    {
      title: "import { ... } from '@embra/reactivity/react'",
      exports: [
        {
          title: "React Hooks and Components",
          code: "export * from './src/react'",
          externals: ["@embra/reactivity", "react"],
        },
      ],
    },
  ],
});
