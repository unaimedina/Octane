import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Build every app/brand icon from the source images in ./assets.
 *
 * Keep the PNGs in assets as the source of truth: replacing assets/icon.png and
 * assets/logo.png then running `npm run icons` refreshes the favicon, app icons,
 * Apple touch icon, manifest icons and the Open Graph logo.
 */

const root = process.cwd();
const assetsDir = path.join(root, "assets");
const appDir = path.join(root, "src", "app");
const brandDir = path.join(root, "public", "brand");

const BACKGROUND = "#0b0f14";

function transparent() {
  return { r: 0, g: 0, b: 0, alpha: 0 };
}

async function renderIcon(size, output, options = {}) {
  const { padding = 0, flatten = false } = options;
  let pipeline = sharp(path.join(assetsDir, "icon.png"));

  if (padding > 0) {
    const inner = size - padding * 2;
    pipeline = pipeline
      .resize(inner, inner, { fit: "contain", background: transparent() })
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: BACKGROUND,
      });
  } else {
    pipeline = pipeline.resize(size, size, {
      fit: "contain",
      background: transparent(),
    });
  }

  if (flatten || padding > 0) {
    pipeline = pipeline.flatten({ background: BACKGROUND });
  }

  await pipeline.png({ compressionLevel: 9 }).toFile(output);
}

/** Pack PNGs into an ICO container (PNG-compressed entries, supported by all modern browsers). */
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
      data: await sharp(path.join(assetsDir, "icon.png"))
        .resize(size, size, { fit: "contain", background: transparent() })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    })),
  );
  await mkdir(appDir, { recursive: true });
  await writeFile(path.join(appDir, "favicon.ico"), encodeIco(entries));
}

async function buildLogo() {
  await mkdir(brandDir, { recursive: true });
  await sharp(path.join(assetsDir, "logo.png"))
    .resize({ width: 1200 })
    .png({ compressionLevel: 9 })
    .toFile(path.join(brandDir, "logo.png"));
}

async function main() {
  await Promise.all([
    mkdir(appDir, { recursive: true }),
    mkdir(brandDir, { recursive: true }),
  ]);

  await Promise.all([
    renderIcon(512, path.join(appDir, "icon.png")),
    renderIcon(180, path.join(appDir, "apple-icon.png"), { flatten: true }),
    renderIcon(192, path.join(brandDir, "icon-192.png")),
    renderIcon(512, path.join(brandDir, "icon-512.png")),
    renderIcon(512, path.join(brandDir, "icon-maskable-512.png"), {
      padding: 51,
    }),
    buildFavicon(),
    buildLogo(),
  ]);

  console.log("Generated app, favicon and brand icons from ./assets.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
