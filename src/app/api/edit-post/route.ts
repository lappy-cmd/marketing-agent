import { errorResponse } from "@/lib/api-errors";
import { editPost } from "@/lib/content-engine";
import { EditPostRequestSchema } from "@/lib/schemas";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const req = EditPostRequestSchema.parse(await request.json());
    if (req.slideImages.length !== req.plan.slides.length) {
      return Response.json({ error: "Slide images don't match the slides." }, { status: 400 });
    }
    return Response.json({ edit: await editPost(req) });
  } catch (error) {
    return errorResponse(error);
  }
}
