import { errorResponse } from "@/lib/api-errors";
import { renderSlide } from "@/lib/render-slide";
import { RenderRequestSchema } from "@/lib/schemas";

const MAX_LOGO_CHARS = 1_500_000; // ~1 MB image as base64

export async function POST(request: Request) {
  try {
    const req = RenderRequestSchema.parse(await request.json());
    if (req.brand.logoDataUrl && req.brand.logoDataUrl.length > MAX_LOGO_CHARS) {
      return Response.json({ error: "Logo is too large (max 1 MB)." }, { status: 413 });
    }
    return await renderSlide(req);
  } catch (error) {
    return errorResponse(error);
  }
}
