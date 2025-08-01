import { defineConfig } from "export-size-svg";

export default defineConfig({
  title: "@embra/reactivity",
  out: "./docs/assets",
  svg: {
    theme: {
      titleColor: "#fb4c1bf7",
      progressColor: "#fb4a1b",
      progressTrackColor: "#fb4c1b37",
    },
  },
  exports: [
    {
      title: "*",
      code: "export * from './src/index.ts'",
    },
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
      title: "{ compute }",
      code: "export { compute } from './src/compute.ts'",
      externals: ["./readable", "./utils"],
    },
    {
      title: "{ combine }",
      code: "export { combine } from './src/combine.ts'",
      externals: ["./compute"],
    },
    {
      title: "{ derive }",
      code: "export { derive } from './src/derive.ts'",
      externals: ["./compute"],
    },
    {
      title: "{ reactiveMap }",
      code: "export { reactiveMap } from './src/collections/reactiveMap.ts'",
      externals: ["../batch", "../readable", "../utils"],
    },
    {
      title: "{ reactiveSet }",
      code: "export { reactiveSet } from './src/collections/reactiveSet.ts'",
      externals: ["../batch", "../readable", "../utils"],
    },
  ],
});
