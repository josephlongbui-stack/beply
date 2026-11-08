/** The checked-in schema uses simple DDL statements, without SQL function bodies. */
export function schemaStatements(source: string) {
  return source
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}
