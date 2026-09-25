import { errorResponse } from "@/lib/api-errors";
import { research } from "@/lib/content-engine";
import { ResearchRequestSchema } from "@/lib/schemas";

// Web search can take a while.
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { input, photoLabels } = ResearchRequestSchema.parse(await request.json());
    return Response.json({ notes: await research(input, photoLabels) });
  } catch (error) {
    return errorResponse(error);
  }
}
