import { errorResponse } from "@/lib/api-errors";
import { fetchImage } from "@/lib/safe-fetch";
import { ImportImageRequestSchema } from "@/lib/schemas";

// The browser can't read a cross-origin image into a canvas, so the server
// downloads the chosen image and hands the bytes back.
export async function POST(request: Request) {
  try {
    const { url } = ImportImageRequestSchema.parse(await request.json());
    const { bytes, contentType } = await fetchImage(url);
    return new Response(bytes, { headers: { "Content-Type": contentType, "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
