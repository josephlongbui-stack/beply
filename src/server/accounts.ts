import { randomBytes } from "node:crypto";
import { passwordHash, passwordMatches } from "./passwords";
export { passwordHash, passwordMatches } from "./passwords";
import { z } from "zod";
import { Repository, hashToken } from "./repository";
export const credentials = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(60)
    .regex(
      /^[a-z0-9_.-]+$/,
      "Use letters, numbers, dots, dashes or underscores",
    ),
  password: z.string().min(12, "Use at least 12 characters").max(128),
});
export function accountFor(db: Repository, owner: string) {
  const r = db.db
    .prepare("SELECT username FROM accounts WHERE owner_session=?")
    .get(owner);
  return r ? { username: r.username as string } : null;
}
export function issueAccountSession(db: Repository, owner: string) {
  const token = randomBytes(32).toString("hex");
  db.db
    .prepare("DELETE FROM account_sessions WHERE expires_at < ?")
    .run(Date.now());
  db.db
    .prepare("INSERT INTO account_sessions VALUES(?,?,?)")
    .run(hashToken(token), owner, Date.now() + 7 * 86400000);
  return token;
}
export async function register(db: Repository, owner: string, raw: unknown) {
  const { username, password } = credentials.parse(raw);
  if (accountFor(db, owner))
    throw new Error("This workspace already belongs to an account.");
  const encoded = await passwordHash(password);
  return db.transaction(() => {
    if (
      db.db
        .prepare("SELECT username FROM accounts WHERE username=?")
        .get(username)
    )
      throw new Error("That username is already in use.");
    db.db
      .prepare("INSERT INTO accounts VALUES(?,?,?,?)")
      .run(username, owner, encoded, new Date().toISOString());
    // The original guest token is rejected once its workspace is claimed.
    return issueAccountSession(db, owner);
  });
}
export async function login(db: Repository, raw: unknown) {
  const { username, password } = credentials.parse(raw);
  const now = Date.now();
  const attempt = db.db
    .prepare("SELECT failures, started_at FROM login_attempts WHERE username=?")
    .get(username);
  if (
    attempt &&
    now - Number(attempt.started_at) < 15 * 60000 &&
    Number(attempt.failures) >= 5
  )
    throw new Error("Too many sign-in attempts. Try again in 15 minutes.");
  // Count before awaiting the KDF so simultaneous requests cannot bypass the limit.
  db.db
    .prepare(
      "INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(username) DO UPDATE SET failures=CASE WHEN ?-started_at>=900000 THEN 1 ELSE failures+1 END, started_at=CASE WHEN ?-started_at>=900000 THEN ? ELSE started_at END",
    )
    .run(username, now, now, now, now);
  const row = db.db
    .prepare(
      "SELECT owner_session,password_hash FROM accounts WHERE username=?",
    )
    .get(username);
  const matched = await passwordMatches(
    password,
    (row?.password_hash as string) ??
      `scrypt1:${"0".repeat(48)}:${"0".repeat(128)}`,
  );
  if (!row || !matched) throw new Error("Username or password is incorrect.");
  db.db.prepare("DELETE FROM login_attempts WHERE username=?").run(username);
  return issueAccountSession(db, row.owner_session as string);
}
