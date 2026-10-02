import { errorResponse } from "@/lib/api-errors";
import { imageSources, searchImages } from "@/lib/image-search";
import { FindImagesRequestSchema } from "@/lib/schemas";

// Which image sources have an API key configured.
export async function GET() {
  return Response.json(imageSources());
}

export async function POST(request: Request) {
  try {
    const { query, kind } = FindImagesRequestSchema.parse(await request.json());
    return Response.json(await searchImages(query, kind));
  } catch (error) {
    return errorResponse(error);
  }
}
