import { errorResponse } from "@/lib/api-errors";
import { regenerateSlide } from "@/lib/content-engine";
import { RegenerateSlideRequestSchema } from "@/lib/schemas";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { input, plan, index, instruction } = RegenerateSlideRequestSchema.parse(await request.json());
    if (index >= plan.slides.length) {
      return Response.json({ error: "Slide index out of range." }, { status: 400 });
    }
    const slide = await regenerateSlide(input, plan, index, instruction);
    return Response.json({ slide });
  } catch (error) {
    return errorResponse(error);
  }
}
