import { languageForPath } from "./languages.ts";

/**
 * How many leading bytes of a file are inspected when deciding text vs binary.
 * The whole body is still returned to the caller; only this prefix is sampled.
 */
export const SAMPLE_BYTES = 8192;

/**
 * Extensions that are binary no matter what their `Content-Type` says or how
 * their first bytes look. `svg` is deliberately absent: it is text.
 */
export const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  // images
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "ico",
  "bmp",
  "tif",
  "tiff",
  "heic",
  // audio and video
  "mp3",
  "wav",
  "ogg",
  "flac",
  "m4a",
  "mp4",
  "m4v",
  "mov",
  "webm",
  "mkv",
  "avi",
  "mpg",
  "mpeg",
  // archives
  "zip",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "tar",
  "jar",
  // documents
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  // fonts
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  // executables and libraries
  "exe",
  "dll",
  "so",
  "dylib",
  "class",
  "o",
  "a",
  "wasm",
  // data
  "sqlite",
  "db",
  "lockb",
]);

/**
 * Language ids that do not prove a file is readable text: `text` is the
 * fallback for unknown extensions, and the other three are non-text kinds.
 */
const UNPROVEN_LANGUAGE_IDS = new Set(["text", "image", "pdf", "wasm"]);

/**
 * Whether a `Content-Type` describes text. Kept separate from the byte
 * sniffing because it is also used to pick the `mimeType` we report back.
 */
export function isTextLikeContentType(contentType: string): boolean {
  const value = contentType.toLowerCase();
  return (
    value.startsWith("text/") ||
    /json|javascript|ecmascript|xml|svg|x-sh|toml|yaml|sql|markdown|csv/.test(value)
  );
}

/** Lowercase segment after the last dot of the basename, if it has one. */
function extensionOf(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  const base = (normalized.split("/").pop() ?? normalized).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot === -1 ? undefined : base.slice(dot + 1);
}

/** A NUL byte in the sampled prefix means the file is not text. */
function hasNulByte(bytes: Uint8Array): boolean {
  return bytes.subarray(0, SAMPLE_BYTES).includes(0);
}

/**
 * The sample can stop in the middle of a multi-byte UTF-8 sequence. That is
 * only possible when the file is longer than the sample, so unsampled files
 * must decode as-is.
 */
function decodesAsUtf8(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, SAMPLE_BYTES);
  const maxTrim = bytes.length > SAMPLE_BYTES ? 3 : 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let trim = 0; trim <= maxTrim; trim += 1) {
    try {
      decoder.decode(sample.subarray(0, sample.length - trim));
      return true;
    } catch {
      // cut sequence at the boundary: retry without one more trailing byte
    }
  }
  return false;
}

/**
 * Decides whether a file served by OpenCode should be shown as text.
 *
 * OpenCode derives `Content-Type` from the extension with a generic MIME table
 * (`.ts` arrives as `video/mp2t`, `.py`/`.go` as `application/octet-stream`), so
 * the header is only a hint. Extension, bytes and our own language table decide.
 */
export function isTextFile(input: {
  path: string;
  contentType: string;
  bytes: Uint8Array;
}): boolean {
  const extension = extensionOf(input.path);
  if (extension && BINARY_EXTENSIONS.has(extension)) return false;
  if (hasNulByte(input.bytes)) return false;
  if (!UNPROVEN_LANGUAGE_IDS.has(languageForPath(input.path).id)) return true;
  if (isTextLikeContentType(input.contentType)) return true;
  return decodesAsUtf8(input.bytes);
}
