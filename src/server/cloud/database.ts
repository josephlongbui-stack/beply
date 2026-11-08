import { neon } from "@neondatabase/serverless";
export type Statement = { text: string; params?: unknown[] };
export interface SqlDatabase {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
  transaction(statements: Statement[]): Promise<unknown>;
}
export function database(): SqlDatabase {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Cloud database is not configured.");
  const sql = neon(url);
  return {
    query: async <T extends Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ) => (await sql.query(text, params)) as T[],
    transaction: async (statements) =>
      sql.transaction(statements.map((s) => sql.query(s.text, s.params ?? []))),
  };
}
