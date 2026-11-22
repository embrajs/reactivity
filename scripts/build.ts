import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build as buildDts } from "@hyrious/dts";
import { build, type Plugin } from "esbuild";
import ts from "typescript";

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

function devGatePlugin(isDev: boolean): Plugin {
  return {
    name: "dev-gate",
    setup(pluginBuild) {
      pluginBuild.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
        const source = await readFile(path, "utf8");
        if (!source.includes("__DEV__")) {
          return { contents: source, loader: "ts" };
        }
        const sf = ts.createSourceFile(path, source, ts.ScriptTarget.ESNext, false, ts.ScriptKind.TS);
        const edits: [number, number, string][] = [];
        const visit = (node: ts.Node): void => {
          if (ts.isIfStatement(node) && ts.isIdentifier(node.expression) && node.expression.text === "__DEV__") {
            const branch = isDev ? node.thenStatement : node.elseStatement;
            const replacement = branch
              ? ts.isBlock(branch)
                ? source.slice(branch.getStart(sf) + 1, branch.end - 1).trim()
                : source.slice(branch.getStart(sf), branch.end)
              : "";
            edits.push([node.getStart(sf), node.end, replacement]);
            return;
          }
          ts.forEachChild(node, visit);
        };
        ts.forEachChild(sf, visit);
        let contents = source;
        for (let i = edits.length - 1; i >= 0; i--) {
          const [start, end, replacement] = edits[i];
          contents = contents.slice(0, start) + replacement + contents.slice(end);
        }
        return { contents, loader: "ts" };
      });
    },
  };
}

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
    target: "esnext",
    treeShaking: true,
    define: { __DEV__: String(isDev) },
    minify: !isDev && minify,
    mangleProps: /[^_]_$/,
    mangleQuoted: true,
    mangleCache,
    plugins: [devGatePlugin(isDev)],
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
assert(!/process\.env|__DEV__|__dev_|checkCollectionWrite/.test(prodBundle), "Dev diagnostics leaked into index.mjs");
assert(!/process\.env|__DEV__/.test(devBundle), "Unresolved env token leaked into index.dev.mjs");
assert(devBundle.includes("__dev_disposed_at"), "Dev diagnostics missing from index.dev.mjs");

await writeFile(cachePath, `${JSON.stringify(mangleCache, null, 2)}\n`);
