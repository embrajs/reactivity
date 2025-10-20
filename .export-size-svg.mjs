import { defineConfig } from "export-size-svg";

import mangleCache from "./mangle-cache.json" with { type: "json" };

export default defineConfig({
  title: "@embra/reactivity",
  out: "./docs/assets",
  esbuildOptions: {
    sourcesContent: false,
    mangleProps: /[^_]_$/,
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
      title: "{ readable, writable } (core)",
      code: "export { readable, writable } from './src/index.ts'",
    },
    {
      title: "{ watch }",
      code: "export { watch } from './src/watch.ts'",
      externals: ["./batch", "./utils"],
    },
    {
      title: "{ compute, combine, derive }",
      code: "export { compute } from './src/compute.ts';export { combine } from './src/combine.ts';export { derive } from './src/derive.ts'",
      externals: ["./readable", "./utils"],
    },
    {
      title: "{ reactiveMap, reactiveSet, reactiveArray } (collections)",
      code: "export { reactiveMap } from './src/collections/reactiveMap.ts';export { reactiveSet } from './src/collections/reactiveSet.ts';export { reactiveArray } from './src/collections/reactiveArray.ts'",
      externals: ["../batch", "../readable", "../utils"],
    },
    {
      title: "{ MicrotaskScheduler, asyncScheduler } (schedulers)",
      code: "export { MicrotaskScheduler, asyncScheduler } from './src/schedulers/index.ts'",
    },
    {
      title: "React Hooks",
      code: "export * from './src/react/index.ts'",
      externals: ["@embra/reactivity", "react"],
    },
  ],
});
