/**
 * Generate an AUTH_PASSWORD_HASH value using the same scrypt parameters that
 * the web client verifies.
 *
 *   node scripts/hash-password.mjs "my long password"
 *   npm run hash-password -- "my long password"
 */
import { randomBytes, scrypt } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- "your password"');
  process.exit(1);
}

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const salt = randomBytes(16);

const derived = await new Promise((resolve, reject) => {
  scrypt(
    password,
    salt,
    KEYLEN,
    { N, r: R, p: P, maxmem: 64 * 1024 * 1024 },
    (error, result) => (error ? reject(error) : resolve(result)),
  );
});

const hash = ["scrypt", N, R, P, salt.toString("base64"), derived.toString("base64")].join(
  ":",
);
console.log(hash);
