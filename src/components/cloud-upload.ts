export async function sendSource(
  file: File,
  purpose: "document" | "backup",
  fields: Record<string, string>,
  cloud = false,
) {
  const endpoint = purpose === "backup" ? "/api/backup" : "/api/documents";
  if (!cloud) {
    const form = new FormData();
    form.set("file", file);
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return fetch(endpoint, { method: "POST", body: form });
  }
  if (!file.size || file.size > (purpose === "backup" ? 16 : 8) * 1024 * 1024)
    throw new Error(
      `Choose a nonempty file up to ${purpose === "backup" ? 16 : 8} MB.`,
    );
  const { upload } = await import("@vercel/blob/client");
  const blob = await upload(`incoming/${crypto.randomUUID()}.bin`, file, {
    access: "private",
    handleUploadUrl: "/api/uploads",
    clientPayload: purpose,
    contentType: file.type || "application/octet-stream",
  });
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pathname: blob.pathname,
      name: file.name,
      ...fields,
    }),
  });
}
