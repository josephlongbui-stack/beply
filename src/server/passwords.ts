import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
function key(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (e, v) => (e ? reject(e) : resolve(v)),
    ),
  );
}
export async function passwordHash(password: string) {
  const salt = randomBytes(24).toString("hex");
  return `scrypt1:${salt}:${(await key(password, salt)).toString("hex")}`;
}
export async function passwordMatches(password: string, encoded: string) {
  const [version, salt, hex] = encoded.split(":");
  if (version !== "scrypt1" || !salt || !hex || !/^[a-f0-9]{128}$/.test(hex))
    return false;
  return timingSafeEqual(await key(password, salt), Buffer.from(hex, "hex"));
}
