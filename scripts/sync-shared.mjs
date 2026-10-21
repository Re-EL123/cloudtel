#!/usr/bin/env node
/**
 * Sync canonical packages into the static web app mirrors.
 * Canonical:  packages/shared/src  -> apps/web/assets/js/shared/
 *             packages/ui/src      -> apps/web/assets/js/ui/
 * Never edit the mirrors by hand (see AGENTS.md §3).
 */
import { cp, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const pairs = [
  ["packages/shared/src", "apps/web/assets/js/shared"],
  ["packages/ui/src", "apps/web/assets/js/ui"],
];

for (const [from, to] of pairs) {
  const src = path.join(root, from);
  const dest = path.join(root, to);
  if (!existsSync(src)) {
    console.error(`sync-shared: missing source ${from}`);
    process.exit(1);
  }
  await rm(dest, { recursive: true, force: true });
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
  const files = (await readdir(dest)).length;
  console.log(`sync-shared: ${from} -> ${to} (${files} entries)`);
}
console.log("sync-shared: done");
