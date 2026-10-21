#!/usr/bin/env node
/**
 * Zero-dependency static file server for apps/web (local development only).
 * Usage: node scripts/serve-web.mjs [port]
 */
import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/web");
const port = Number(process.argv[2] || process.env.PORT || 3000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

async function resolveFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  let file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) return null;
  try {
    const info = await stat(file);
    if (info.isDirectory()) {
      file = path.join(file, "index.html");
      await stat(file);
    }
    return file;
  } catch {
    if (path.extname(file) === "") {
      try {
        const withHtml = `${file}.html`;
        await stat(withHtml);
        return withHtml;
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const file = await resolveFile(req.url || "/");
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
    return;
  }
  const type = TYPES[path.extname(file)] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`CloudTel web app: http://localhost:${port}`);
  console.log(`Serving ${root}`);
  console.log(`Point API_BASE_URL at your API (e.g. http://localhost:3001/api/v1).`);
});
