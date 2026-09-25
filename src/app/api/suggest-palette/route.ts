import { errorResponse } from "@/lib/api-errors";
import { suggestPalette } from "@/lib/content-engine";
import { SuggestPaletteRequestSchema } from "@/lib/schemas";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { input, photos } = SuggestPaletteRequestSchema.parse(await request.json());
    return Response.json({ palette: await suggestPalette(input, photos) });
  } catch (error) {
    return errorResponse(error);
  }
}
