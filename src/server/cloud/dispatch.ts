export const cloudEnabled = () =>
  process.env.VERCEL === "1" || process.env.BEPLY_STORAGE === "cloud";
export async function cloudRequest(request: Request) {
  const { handle } = await import("./api");
  return handle(request);
}
