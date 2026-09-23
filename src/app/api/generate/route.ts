import { errorResponse } from "@/lib/api-errors";
import { generateCarousel } from "@/lib/content-engine";
import { BusinessInputSchema } from "@/lib/schemas";

// Generation (plus an optional repair pass) can take a while.
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const input = BusinessInputSchema.parse(await request.json());
    const plan = await generateCarousel(input);
    return Response.json({ plan });
  } catch (error) {
    return errorResponse(error);
  }
}
