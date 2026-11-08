import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { passwordHash, passwordMatches } from "../passwords";
import type { SqlDatabase } from "./database";
const credentials = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9_.-]+$/),
  password: z.string().min(12, "Use at least 12 characters").max(128),
  invite: z.string().max(200).optional(),
});
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function rateLimit(
  db: SqlDatabase,
  key: string,
  max: number,
  windowMs: number,
) {
  const now = Date.now();
  const [row] = await db.query(
    "INSERT INTO beply_rate_limits(key,attempts,started_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN $2-beply_rate_limits.started_at >= $3 THEN 1 ELSE beply_rate_limits.attempts+1 END, started_at=CASE WHEN $2-beply_rate_limits.started_at >= $3 THEN $2 ELSE beply_rate_limits.started_at END RETURNING attempts",
    [key, now, windowMs],
  );
  if (Number(row.attempts) > max)
    throw new Error("Too many attempts. Try again later.");
}
export async function findAccount(db: SqlDatabase, token?: string) {
  if (!token) return null;
  const [row] = await db.query<{ id: string; username: string }>(
    "SELECT a.id,a.username FROM beply_sessions s JOIN beply_accounts a ON a.id=s.owner_id WHERE s.token_hash=$1 AND s.expires_at > now()",
    [tokenHash(token)],
  );
  return row ?? null;
}
export async function createCloudAccount(
  db: SqlDatabase,
  raw: unknown,
  inviteCode = process.env.BEPLY_SIGNUP_CODE,
) {
  const { username, password, invite } = credentials.parse(raw);
  if (
    !inviteCode ||
    inviteCode.length < 32 ||
    !invite ||
    !timingSafeEqual(
      Buffer.from(tokenHash(invite)),
      Buffer.from(tokenHash(inviteCode)),
    )
  )
    throw new Error(
      "A valid owner setup code is required to create the account.",
    );
  await rateLimit(db, "register", 5, 15 * 60000);
  const owner = crypto.randomUUID(),
    token = randomBytes(32).toString("hex"),
    hash = await passwordHash(password);
  try {
    await db.transaction([
      {
        text: "INSERT INTO beply_invites(token_hash) VALUES($1)",
        params: [tokenHash(inviteCode)],
      },
      {
        text: "INSERT INTO beply_accounts(id,username,password_hash) VALUES($1,$2,$3)",
        params: [owner, username, hash],
      },
      {
        text: "INSERT INTO beply_sessions(token_hash,owner_id,expires_at) VALUES($1,$2,$3)",
        params: [
          tokenHash(token),
          owner,
          new Date(Date.now() + 7 * 86400000).toISOString(),
        ],
      },
    ]);
  } catch {
    throw new Error(
      "Account could not be created. The username or owner setup code may already be used.",
    );
  }
  return token;
}
export async function loginCloud(db: SqlDatabase, raw: unknown) {
  const { username, password } = credentials.parse(raw);
  await rateLimit(db, `login:${username}`, 5, 15 * 60000);
  const [row] = await db.query<{ id: string; password_hash: string }>(
    "SELECT id,password_hash FROM beply_accounts WHERE username=$1",
    [username],
  );
  const matched = await passwordMatches(
    password,
    row?.password_hash ?? `scrypt1:${"0".repeat(48)}:${"0".repeat(128)}`,
  );
  if (!row || !matched) throw new Error("Username or password is incorrect.");
  const token = randomBytes(32).toString("hex");
  await db.transaction([
    {
      text: "DELETE FROM beply_rate_limits WHERE key=$1",
      params: [`login:${username}`],
    },
    { text: "DELETE FROM beply_sessions WHERE expires_at < now()" },
    {
      text: "INSERT INTO beply_sessions(token_hash,owner_id,expires_at) VALUES($1,$2,$3)",
      params: [
        tokenHash(token),
        row.id,
        new Date(Date.now() + 7 * 86400000).toISOString(),
      ],
    },
  ]);
  return token;
}
