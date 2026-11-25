import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = join(root, "skills/embra-reactivity/SKILL.md");

const raw = await readFile(sourcePath, "utf8");
const content = `${raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, "").trimStart()}`;

const targets = process.argv.slice(2);
if (targets.length === 0) {
  targets.push("llms.txt");
}

for (const target of targets) {
  const outPath = resolve(root, target);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, content, "utf8");
}
