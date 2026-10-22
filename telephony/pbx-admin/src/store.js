/**
 * Small JSON file store for the PBX admin service. The CloudTel database owns
 * extension metadata; this file exists so the PBX can be rebuilt after a
 * restart without a control-plane round trip. Writes are atomic.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function createStore(file) {
  let cache = null;

  async function load() {
    if (cache) return cache;
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw);
      cache = Array.isArray(parsed?.extensions) ? parsed.extensions : [];
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      cache = [];
    }
    return cache;
  }

  async function save(extensions) {
    cache = extensions;
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify({ version: 1, extensions }, null, 2) + "\n", { mode: 0o600 });
    await rename(tmp, file);
  }

  return {
    async list() {
      return [...(await load())];
    },
    async get(number) {
      return (await load()).find((ext) => ext.number === number) || null;
    },
    async upsert(extension) {
      const extensions = await load();
      const index = extensions.findIndex((ext) => ext.number === extension.number);
      if (index === -1) extensions.push(extension);
      else extensions[index] = { ...extensions[index], ...extension };
      await save(extensions);
      return extension;
    },
    async remove(number) {
      const extensions = await load();
      const next = extensions.filter((ext) => ext.number !== number);
      await save(next);
      return next.length !== extensions.length;
    },
  };
}
