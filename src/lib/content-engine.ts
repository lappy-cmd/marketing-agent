import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  buildGenerateContent,
  buildPaletteContent,
  buildRegenerateSlidePrompt,
  buildRepairContent,
  buildResearchPrompt,
  RESEARCH_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} from "./prompts";
import {
  CarouselPlanSchema,
  HEX,
  PaletteSchema,
  SlideSchema,
  type BusinessInput,
  type CarouselPlan,
  type Palette,
  type PhotoInput,
  type Slide,
} from "./schemas";

const client = new Anthropic();

const MODEL = "claude-opus-5";

// `fallbacks: "default"` re-runs a request on a fallback model server-side if
// the safety classifiers decline it.
const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[],
  fallbacks: "default" as const,
};

export class ContentEngineError extends Error {}

function checkStop(stop: string | null) {
  if (stop === "refusal") {
    throw new ContentEngineError("The model declined this request. Try rewording the business description.");
  }
  if (stop === "max_tokens") throw new ContentEngineError("The response was cut off. Please try again.");
}

// One structured-output call. Opus 5 thinks adaptively by default; medium
// effort keeps generation fast enough for an interactive UI.
async function callModel<T extends z.ZodType>(
  content: string | Anthropic.Beta.BetaContentBlockParam[],
  schema: T,
): Promise<z.infer<T>> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });
  checkStop(response.stop_reason);
  if (!response.parsed_output) {
    throw new ContentEngineError("The model returned an unreadable response. Please try again.");
  }
  return response.parsed_output as z.infer<T>;
}

// ---------- Research (web search) ----------

const MAX_CONTINUATIONS = 3;

// Looks up real-world facts for the post topic (e.g. actual burger spots in
// KL) so rankings don't rely on the model's memory.
export async function research(input: BusinessInput, photoLabels: string[] = []): Promise<string> {
  if (!input.topic) return "";
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: buildResearchPrompt(input, photoLabels) },
  ];

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      // Low effort + a search cap keeps research to well under a minute; the
      // writer does the heavy thinking afterwards.
      output_config: { effort: "low" },
      system: RESEARCH_SYSTEM_PROMPT,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
      messages,
    });
    checkStop(response.stop_reason);

    // The server-side search loop can pause on long turns; re-send the
    // assistant turn as-is and it resumes where it left off.
    if (response.stop_reason === "pause_turn") {
      messages.splice(1, 1, { role: "assistant", content: response.content });
      continue;
    }
    // Keep only the write-up after the last search, not the "I'll look
    // into…" preamble before it.
    const lastSearch = response.content.findLastIndex((b) => b.type === "web_search_tool_result");
    return response.content
      .slice(lastSearch + 1)
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }
  throw new ContentEngineError("Research took too long. Try a narrower topic.");
}

// ---------- Validation ----------

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const LIMITS = {
  hook: { headline: 10, body: 12 },
  value: { headline: 8, body: 25 },
  cta: { headline: 8, body: 20 },
} as const;

// Small overshoots are fine; only flag clear rule breaks so we don't burn a
// repair call on a single extra word.
const TOLERANCE = 2;

function slideIssues(slide: Slide, label: string): string[] {
  const issues: string[] = [];
  const limit = LIMITS[slide.role];
  const hw = wordCount(slide.headline);
  const bw = wordCount(slide.body);
  if (hw > limit.headline + TOLERANCE) issues.push(`${label} headline has ${hw} words (max ${limit.headline}).`);
  if (bw > limit.body + TOLERANCE) issues.push(`${label} body has ${bw} words (max ${limit.body}).`);
  if (/#\w/.test(slide.headline + slide.body))
    issues.push(`${label} contains a hashtag; hashtags belong only in the hashtags list.`);
  if (slide.chips.length > 3) issues.push(`${label} has ${slide.chips.length} chips (max 3).`);
  return issues;
}

export function validatePlan(plan: CarouselPlan, slideCount: number): string[] {
  const issues: string[] = [];
  const { slides } = plan;
  if (slides.length !== slideCount)
    issues.push(`There are ${slides.length} slides; there must be exactly ${slideCount}.`);
  if (slides[0]?.role !== "hook") issues.push('Slide 1 must have role "hook".');
  if (slides.at(-1)?.role !== "cta") issues.push('The last slide must have role "cta".');
  slides.slice(1, -1).forEach((s, i) => {
    if (s.role !== "value") issues.push(`Slide ${i + 2} must have role "value".`);
  });
  slides.forEach((s, i) => issues.push(...slideIssues(s, `Slide ${i + 1}`)));
  if (plan.hashtags.length < 3 || plan.hashtags.length > 5)
    issues.push(`There are ${plan.hashtags.length} hashtags; use 3-5.`);
  if (plan.caption.length > 800) issues.push("The caption is too long; keep it under 600 characters.");
  return issues;
}

// ---------- Normalization ----------

// The model occasionally returns an emoji as escaped text ("🕒")
// instead of the character. Decode that, and drop anything that still isn't a
// pictograph so letters never end up rendered where the emoji goes.
function cleanEmoji(raw: string): string {
  const decoded = raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
  return /^\p{Extended_Pictographic}/u.test(decoded) && !/[A-Za-z0-9\\]/.test(decoded) ? decoded : "";
}

function cleanSlide(slide: Slide, photoCount: number): Slide {
  const idx = Number.isInteger(slide.imageIndex) ? slide.imageIndex : -1;
  return {
    ...slide,
    emoji: cleanEmoji(slide.emoji),
    chips: slide.chips.map((c) => c.trim()).filter(Boolean).slice(0, 3),
    imageIndex: idx >= 0 && idx < photoCount ? idx : -1,
  };
}

const DEFAULT_PALETTE: Palette = {
  primaryColor: "#1F3D2B",
  secondaryColor: "#F2B84B",
  template: "bold",
  reason: "",
};

function cleanPalette(p: Palette): Palette {
  const up = (c: string) => c.trim().toUpperCase();
  return {
    ...p,
    primaryColor: HEX.test(p.primaryColor.trim()) ? up(p.primaryColor) : DEFAULT_PALETTE.primaryColor,
    secondaryColor: HEX.test(p.secondaryColor.trim()) ? up(p.secondaryColor) : DEFAULT_PALETTE.secondaryColor,
  };
}

function normalize(plan: CarouselPlan, photoCount: number): CarouselPlan {
  // Each photo is used at most once; keep the first slide that claims it.
  const used = new Set<number>();
  const slides = plan.slides.map((s) => {
    const slide = cleanSlide(s, photoCount);
    if (slide.imageIndex >= 0 && used.has(slide.imageIndex)) return { ...slide, imageIndex: -1 };
    used.add(slide.imageIndex);
    return slide;
  });
  return {
    ...plan,
    slides,
    palette: cleanPalette(plan.palette),
    hookOptions: [...plan.hookOptions].sort((a, b) => b.score - a.score),
    hashtags: plan.hashtags.map((h) => "#" + h.replace(/^#+/, "").replace(/\s+/g, "")),
  };
}

// ---------- Public API ----------

export async function generateCarousel(
  input: BusinessInput,
  photos: PhotoInput[],
  researchNotes?: string,
): Promise<CarouselPlan> {
  let plan = await callModel(buildGenerateContent(input, photos, researchNotes), CarouselPlanSchema);
  const issues = validatePlan(plan, input.slideCount);

  // One repair pass; if it's still off, return the better of the two drafts
  // rather than failing — the user can edit or regenerate individual slides.
  if (issues.length > 0) {
    const repaired = await callModel(
      buildRepairContent(input, photos, researchNotes, plan, issues),
      CarouselPlanSchema,
    );
    if (validatePlan(repaired, input.slideCount).length <= issues.length) plan = repaired;
  }

  // Structural problems can't be fixed by editing text, so fail loudly on those.
  if (plan.slides.length < 3) {
    throw new ContentEngineError("The generated carousel was incomplete. Please try again.");
  }
  return normalize(plan, photos.length);
}

export async function suggestPalette(input: Partial<BusinessInput>, photos: PhotoInput[]): Promise<Palette> {
  return cleanPalette(await callModel(buildPaletteContent(input, photos), PaletteSchema));
}

export async function regenerateSlide(
  input: BusinessInput,
  plan: CarouselPlan,
  index: number,
  instruction?: string,
): Promise<Slide> {
  const { role, imageIndex } = plan.slides[index];
  const slide = await callModel(buildRegenerateSlidePrompt(input, plan, index, instruction), SlideSchema);
  return { ...cleanSlide(slide, Infinity), role, imageIndex };
}
