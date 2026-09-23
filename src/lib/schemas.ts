import { z } from "zod";

// ---------- User input ----------

export const GOALS = ["awareness", "engagement", "sales", "followers"] as const;
export const VOICES = ["playful", "professional", "bold", "minimal"] as const;
export const FORMATS = [
  "listicle",
  "problem_solution",
  "myth_fact",
  "before_after",
  "behind_scenes",
  "feature_spotlight",
] as const;

export const FORMAT_LABELS: Record<(typeof FORMATS)[number], string> = {
  listicle: "Listicle (\"5 ways to…\")",
  problem_solution: "Problem → Solution",
  myth_fact: "Myth vs. Fact",
  before_after: "Before / After",
  behind_scenes: "Behind the scenes",
  feature_spotlight: "Feature spotlight",
};

export const BusinessInputSchema = z.object({
  businessName: z.string().trim().min(1).max(80),
  industry: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  audience: z.string().trim().min(1).max(300),
  features: z.array(z.string().trim().min(1).max(200)).min(1).max(3),
  goal: z.enum(GOALS),
  voice: z.enum(VOICES),
  slideCount: z.number().int().min(3).max(5),
  format: z.enum(["auto", ...FORMATS]),
  website: z.string().trim().max(120).optional(),
});
export type BusinessInput = z.infer<typeof BusinessInputSchema>;

// ---------- Brand (render-only, never sent to the model) ----------

export const TEMPLATES = ["bold", "gradient", "minimal", "dark"] as const;
export type TemplateId = (typeof TEMPLATES)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const BrandSchema = z.object({
  template: z.enum(TEMPLATES),
  primaryColor: hex,
  secondaryColor: hex,
  handle: z.string().max(40).optional(),
  // Small logo as a data: URL (validated in size by the render route)
  logoDataUrl: z.string().startsWith("data:image/").optional(),
});
export type Brand = z.infer<typeof BrandSchema>;

// ---------- Model output ----------
// Length rules are enforced in content-engine.ts (validatePlan), not in the
// schema, so the model gets a specific repair message instead of a parse error.

export const SlideSchema = z.object({
  role: z.enum(["hook", "value", "cta"]),
  kicker: z
    .string()
    .describe(
      "Short label above the headline. Hook: a 1-3 word category tag. Value: the step/number label like '01' or 'Myth #1'. CTA: the button text like 'Save for later'.",
    ),
  headline: z.string().describe("The main text of the slide. No emoji."),
  body: z.string().describe("Supporting text. Can be empty for the hook."),
  emoji: z.string().describe("One emoji that fits the slide, or empty string."),
});
export type Slide = z.infer<typeof SlideSchema>;

export const CarouselPlanSchema = z.object({
  format: z.enum(FORMATS),
  hookOptions: z
    .array(
      z.object({
        text: z.string(),
        score: z.number().describe("1-10 scroll-stopping power"),
        reason: z.string(),
      }),
    )
    .describe("Exactly 3 candidate hooks, scored honestly."),
  slides: z.array(SlideSchema),
  caption: z.string(),
  hashtags: z.array(z.string()),
});
export type CarouselPlan = z.infer<typeof CarouselPlanSchema>;

// ---------- API request bodies ----------

export const RegenerateSlideRequestSchema = z.object({
  input: BusinessInputSchema,
  plan: CarouselPlanSchema,
  index: z.number().int().min(0).max(4),
  instruction: z.string().max(300).optional(),
});

export const RenderRequestSchema = z.object({
  slide: SlideSchema,
  index: z.number().int().min(0),
  total: z.number().int().min(1).max(10),
  brand: BrandSchema,
  businessName: z.string().max(80),
});
export type RenderRequest = z.infer<typeof RenderRequestSchema>;
