import { cloudEnabled } from "../../../server/cloud/dispatch";
import { uploadToken } from "../../../server/cloud/uploads";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!cloudEnabled())
    return Response.json(
      { error: "Direct cloud uploads are not enabled." },
      { status: 404 },
    );
  return uploadToken(req);
}
