import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  buildGeneratePrompt,
  buildRegenerateSlidePrompt,
  buildRepairPrompt,
  SYSTEM_PROMPT,
} from "./prompts";
import {
  CarouselPlanSchema,
  SlideSchema,
  type BusinessInput,
  type CarouselPlan,
  type Slide,
} from "./schemas";

const client = new Anthropic();

const MODEL = "claude-opus-5";

export class ContentEngineError extends Error {}

// One structured-output call. Opus 5 thinks adaptively by default; medium
// effort keeps generation fast enough for an interactive UI. `fallbacks:
// "default"` re-runs the request on a fallback model server-side if the
// safety classifiers decline it.
async function callModel<T extends z.ZodType>(prompt: string, schema: T): Promise<z.infer<T>> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new ContentEngineError(
      "The model declined this request. Try rewording the business description.",
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new ContentEngineError("The response was cut off. Please try again.");
  }
  if (!response.parsed_output) {
    throw new ContentEngineError("The model returned an unreadable response. Please try again.");
  }
  return response.parsed_output as z.infer<T>;
}

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
  if (hw > limit.headline + TOLERANCE)
    issues.push(`${label} headline has ${hw} words (max ${limit.headline}).`);
  if (bw > limit.body + TOLERANCE)
    issues.push(`${label} body has ${bw} words (max ${limit.body}).`);
  if (/#\w/.test(slide.headline + slide.body))
    issues.push(`${label} contains a hashtag; hashtags belong only in the hashtags list.`);
  return issues;
}

export function validatePlan(plan: CarouselPlan, slideCount: number): string[] {
  const issues: string[] = [];
  const { slides } = plan;
  if (slides.length !== slideCount)
    issues.push(`There are ${slides.length} slides; there must be exactly ${slideCount}.`);
  if (slides[0]?.role !== "hook") issues.push("Slide 1 must have role \"hook\".");
  if (slides.at(-1)?.role !== "cta") issues.push("The last slide must have role \"cta\".");
  slides.slice(1, -1).forEach((s, i) => {
    if (s.role !== "value") issues.push(`Slide ${i + 2} must have role "value".`);
  });
  slides.forEach((s, i) => issues.push(...slideIssues(s, `Slide ${i + 1}`)));
  if (plan.hashtags.length < 3 || plan.hashtags.length > 5)
    issues.push(`There are ${plan.hashtags.length} hashtags; use 3-5.`);
  if (plan.caption.length > 800) issues.push("The caption is too long; keep it under 600 characters.");
  return issues;
}

// The model occasionally returns an emoji as escaped text ("\ud83d\udd52")
// instead of the character. Decode that, and drop anything that still isn't a
// pictograph so letters never end up rendered where the emoji goes.
function cleanEmoji(raw: string): string {
  const decoded = raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
  return /^\p{Extended_Pictographic}/u.test(decoded) && !/[A-Za-z0-9\\]/.test(decoded) ? decoded : "";
}

function cleanSlide(slide: Slide): Slide {
  return { ...slide, emoji: cleanEmoji(slide.emoji) };
}

function normalize(plan: CarouselPlan): CarouselPlan {
  return {
    ...plan,
    slides: plan.slides.map(cleanSlide),
    hookOptions: [...plan.hookOptions].sort((a, b) => b.score - a.score),
    hashtags: plan.hashtags.map((h) => "#" + h.replace(/^#+/, "").replace(/\s+/g, "")),
  };
}

export async function generateCarousel(input: BusinessInput): Promise<CarouselPlan> {
  let plan = await callModel(buildGeneratePrompt(input), CarouselPlanSchema);
  const issues = validatePlan(plan, input.slideCount);

  // One repair pass; if it's still off, return the better of the two drafts
  // rather than failing — the user can edit or regenerate individual slides.
  if (issues.length > 0) {
    const repaired = await callModel(buildRepairPrompt(input, plan, issues), CarouselPlanSchema);
    if (validatePlan(repaired, input.slideCount).length <= issues.length) plan = repaired;
  }

  // Structural problems can't be fixed by editing text, so fail loudly on those.
  if (plan.slides.length < 3) {
    throw new ContentEngineError("The generated carousel was incomplete. Please try again.");
  }
  return normalize(plan);
}

export async function regenerateSlide(
  input: BusinessInput,
  plan: CarouselPlan,
  index: number,
  instruction?: string,
): Promise<Slide> {
  const role = plan.slides[index].role;
  const slide = await callModel(
    buildRegenerateSlidePrompt(input, plan, index, instruction),
    SlideSchema,
  );
  return cleanSlide({ ...slide, role });
}
