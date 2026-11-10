import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Build every app/brand icon from the source images in ./assets.
 *
 * Keep the PNGs in assets as the source of truth: replacing assets/minimal.png
 * or assets/logo.png then running `npm run icons` refreshes the favicon, app
 * icons, Apple touch icon, manifest icons, header mark and Open Graph logo.
 */

const root = process.cwd();
const assetsDir = path.join(root, "assets");
const appDir = path.join(root, "src", "app");
const brandDir = path.join(root, "public", "brand");

const BACKGROUND = "#0b0f14";

function transparent() {
  return { r: 0, g: 0, b: 0, alpha: 0 };
}

let markPromise;

/** The flat OC mark, with its transparent padding trimmed away. */
function trimmedMark() {
  markPromise ??= sharp(path.join(assetsDir, "minimal.png"))
    .trim({ threshold: 1 })
    .png()
    .toBuffer();
  return markPromise;
}

async function iconBuffer(size, options = {}) {
  const { markScale = 0.56, rounded = true, flatten = false } = options;
  const mark = await trimmedMark();
  const target = Math.max(1, Math.round(size * markScale));
  const resized = await sharp(mark)
    .resize(target, target, { fit: "contain", background: transparent() })
    .png()
    .toBuffer();
  const meta = await sharp(resized).metadata();
  const radius = rounded ? Math.round(size * 0.22) : 0;
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" fill="${BACKGROUND}"/>` +
      `</svg>`,
  );

  let pipeline = sharp(background).composite([
    {
      input: resized,
      left: Math.round((size - meta.width) / 2),
      top: Math.round((size - meta.height) / 2),
    },
  ]);
  if (flatten) {
    pipeline = pipeline.flatten({ background: BACKGROUND });
  }
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

async function writeIcon(size, output, options) {
  await writeFile(output, await iconBuffer(size, options));
}

/** Pack PNGs into an ICO container (PNG entries, supported by modern browsers). */
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = 6 + directory.length;

  entries.forEach(({ size, data }, index) => {
    const entry = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, entry);
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    directory.writeUInt8(0, entry + 2); // palette
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // color planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)]);
}

async function buildFavicon() {
  const sizes = [16, 32, 48];
  const entries = await Promise.all(
    sizes.map(async (size) => ({
      size,
      data: await iconBuffer(size, { markScale: 0.62 }),
    })),
  );
  await writeFile(path.join(appDir, "favicon.ico"), encodeIco(entries));
}

async function buildMinimal() {
  const mark = await sharp(path.join(assetsDir, "minimal.png"))
    .trim({ threshold: 1 })
    .resize({ width: 512 })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(brandDir, "minimal.png"), mark);
}

async function buildLogo() {
  const logo = await sharp(path.join(assetsDir, "logo.png"))
    .trim({ threshold: 1 })
    .resize({ width: 1200 })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(brandDir, "logo.png"), logo);
}

async function main() {
  await Promise.all([
    mkdir(appDir, { recursive: true }),
    mkdir(brandDir, { recursive: true }),
  ]);

  await Promise.all([
    writeIcon(512, path.join(appDir, "icon.png")),
    writeIcon(180, path.join(appDir, "apple-icon.png"), { flatten: true }),
    writeIcon(192, path.join(brandDir, "icon-192.png")),
    writeIcon(512, path.join(brandDir, "icon-512.png")),
    writeIcon(512, path.join(brandDir, "icon-maskable-512.png"), {
      markScale: 0.44,
      rounded: false,
      flatten: true,
    }),
    buildFavicon(),
    buildMinimal(),
    buildLogo(),
  ]);

  console.log("Generated app, favicon and brand icons from ./assets.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
