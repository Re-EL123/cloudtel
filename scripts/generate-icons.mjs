#!/usr/bin/env node
/**
 * Generate raster PNG icons (and a favicon.ico) from the CloudTel SVG mark.
 * Usage: node scripts/generate-icons.mjs   (requires `sharp`, a dev dependency)
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imgDir = path.join(root, "apps/web/assets/img");

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38BDF8"/>
      <stop offset="1" stop-color="#0284C7"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#g)"/>
  <path d="M44 76a24 24 0 0 1 24-24" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.55"/>
  <path d="M44 90a38 38 0 0 1 38-38" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.3"/>
  <path d="M46 52c-6 4-9 10-8 17 2 14 15 28 29 30 7 1 13-2 17-8l-12-9c-2 3-5 5-9 4-7-1-14-8-15-15-1-4 1-7 4-9l-6-10z" fill="#fff"/>
</svg>`;

function buildIco(pngBuffers) {
  // ICO container with PNG-encoded entries (supported by all modern browsers).
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = 6 + 16 * count;
  const images = [];

  for (const { size, png } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    images.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...images]);
}

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("sharp is required: npm i -D sharp");
    process.exit(1);
  }

  const svg = Buffer.from(MARK_SVG);
  const targets = [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["apple-touch-icon.png", 180],
    ["favicon-32.png", 32],
  ];

  for (const [name, size] of targets) {
    const png = await sharp(svg, { density: 300 }).resize(size, size).png().toBuffer();
    await writeFile(path.join(imgDir, name), png);
    console.log("wrote", name);
  }

  const ico32 = await sharp(svg, { density: 300 }).resize(32, 32).png().toBuffer();
  const ico16 = await sharp(svg, { density: 300 }).resize(16, 16).png().toBuffer();
  await writeFile(path.join(imgDir, "favicon.ico"), buildIco([
    { size: 16, png: ico16 },
    { size: 32, png: ico32 },
  ]));
  console.log("wrote favicon.ico");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
