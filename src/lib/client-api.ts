import type { Brand, BusinessInput, CarouselPlan, Slide } from "./schemas";

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

export async function generatePlan(input: BusinessInput): Promise<CarouselPlan> {
  return (await postJson<{ plan: CarouselPlan }>("/api/generate", input)).plan;
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
export async function renderSlideImage(params: {
  slide: Slide;
  index: number;
  total: number;
  brand: Brand;
  businessName: string;
}): Promise<string> {
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
