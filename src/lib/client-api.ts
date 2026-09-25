import type {
  BusinessInput,
  CarouselPlan,
  Palette,
  PhotoInput,
  RenderRequest,
  Slide,
} from "./schemas";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function researchTopic(input: BusinessInput, photoLabels: string[]): Promise<string> {
  return (await postJson<{ notes: string }>("/api/research", { input, photoLabels })).notes;
}

export async function generatePlan(input: BusinessInput, photos: PhotoInput[], research?: string): Promise<CarouselPlan> {
  return (await postJson<{ plan: CarouselPlan }>("/api/generate", { input, photos, research })).plan;
}

export async function suggestPalette(input: Partial<BusinessInput>, photos: PhotoInput[]): Promise<Palette> {
  return (await postJson<{ palette: Palette }>("/api/suggest-palette", { input, photos })).palette;
}

export async function regenerateSlide(
  input: BusinessInput,
  plan: CarouselPlan,
  index: number,
  instruction?: string,
): Promise<Slide> {
  return (await postJson<{ slide: Slide }>("/api/regenerate-slide", { input, plan, index, instruction })).slide;
}

// Returns an object URL for the rendered PNG; the caller owns revoking it.
export async function renderSlideImage(params: RenderRequest): Promise<string> {
  const res = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Render failed (${res.status})`);
  }
  return URL.createObjectURL(await res.blob());
}
