#!/usr/bin/env node
/**
 * Guard: the Vercel API must contain at most 12 serverless functions.
 * Each endpoint group under apps/api/api/v1/<group>/[...path].js is one function.
 */
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_FUNCTIONS = 12;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "apps/api/api/v1");

if (!existsSync(apiDir)) {
  console.error("check-functions: apps/api/api/v1 not found");
  process.exit(1);
}

async function collect(dir, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collect(full, found);
    } else if (/\.js$/.test(entry.name)) {
      found.push(path.relative(apiDir, full));
    }
  }
  return found;
}

const files = (await collect(apiDir)).sort();
const groups = [...new Set(files.map((f) => f.split(path.sep)[0]))];
const count = files.length;

console.log(`Serverless functions found (${count}/${MAX_FUNCTIONS}):`);
for (const f of files) console.log(`  - ${f}`);

if (count > MAX_FUNCTIONS) {
  console.error(
    `\nFAIL: ${count} serverless functions exceeds the ${MAX_FUNCTIONS}-function ceiling (AGENTS.md §2).`
  );
  process.exit(1);
}
if (groups.length !== count) {
  console.warn("\nWARN: a group contains more than one function file.");
}
console.log(`\nOK: ${count} serverless functions (ceiling ${MAX_FUNCTIONS}).`);
