import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pruneBranchesPlugin } from "@embra/esbuild-plugin-prune-branches";
import { build as buildDts } from "@hyrious/dts";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const outdir = join(root, "dist");
const entryPoints = {
  index: join(root, "src/index.ts"),
  react: join(root, "src/react/index.ts"),
  debug: join(root, "src/debug/index.ts"),
};
const { name: packageName } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const cachePath = join(root, "mangle-cache.json");
const mangleCache: Record<string, string | false> = JSON.parse(await readFile(cachePath, "utf8"));
const minify = Boolean(process.env.MINIFY);

await rm(outdir, { recursive: true, force: true });

for (const [extension, isDev] of [
  [".mjs", false],
  [".dev.mjs", true],
] as const) {
  const result = await build({
    absWorkingDir: root,
    entryPoints,
    outdir,
    outExtension: { ".js": extension },
    bundle: true,
    format: "esm",
    platform: "neutral",
    packages: "external",
    external: [packageName],
    target: "esnext",
    treeShaking: true,
    define: { __DEV__: String(isDev) },
    minify: !isDev && minify,
    mangleProps: /[^_]_$/,
    mangleQuoted: true,
    mangleCache,
    plugins: [pruneBranchesPlugin({ __DEV__: isDev })],
    logLevel: "info",
  });

  Object.assign(mangleCache, result.mangleCache);
}

await buildDts({
  entryPoints,
  outdir,
  exclude: [packageName],
  outputOptions: {
    entryFileNames: "[name].d.mts",
  },
});

const prodBundle = await readFile(join(outdir, "index.mjs"), "utf8");
const devBundle = await readFile(join(outdir, "index.dev.mjs"), "utf8");
const reactProdBundle = await readFile(join(outdir, "react.mjs"), "utf8");
const reactDevBundle = await readFile(join(outdir, "react.dev.mjs"), "utf8");
assert(!/process\.env|__DEV__|__dev_|checkCollectionWrite/.test(prodBundle), "Dev diagnostics leaked into index.mjs");
assert(!/process\.env|__DEV__/.test(devBundle), "Unresolved env token leaked into index.dev.mjs");
assert(devBundle.includes("__dev_disposed_at"), "Dev diagnostics missing from index.dev.mjs");
assert(
  reactProdBundle.includes('"@embra/reactivity"') && reactProdBundle.includes('"react"'),
  "react.mjs must externally import @embra/reactivity and react",
);
assert(!/__DEV__|ValueNode|ComputedNode/.test(reactProdBundle), "Core internals or dev tokens leaked into react.mjs");
assert(
  reactDevBundle.includes('"@embra/reactivity"') && reactDevBundle.includes('"react"'),
  "react.dev.mjs must externally import @embra/reactivity and react",
);
assert(!/__DEV__/.test(reactDevBundle), "Unresolved env token leaked into react.dev.mjs");

await writeFile(cachePath, `${JSON.stringify(mangleCache, null, 2)}\n`);
