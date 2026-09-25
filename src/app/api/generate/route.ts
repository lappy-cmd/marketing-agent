import { errorResponse } from "@/lib/api-errors";
import { generateCarousel } from "@/lib/content-engine";
import { GenerateRequestSchema } from "@/lib/schemas";

// Generation (plus an optional repair pass) can take a while.
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { input, photos, research } = GenerateRequestSchema.parse(await request.json());
    const plan = await generateCarousel(input, photos, research);
    return Response.json({ plan });
  } catch (error) {
    return errorResponse(error);
  }
}
