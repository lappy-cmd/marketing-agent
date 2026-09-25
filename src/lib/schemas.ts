import { z } from "zod";

// ---------- User input ----------

export const GOALS = ["awareness", "engagement", "sales", "followers"] as const;
export const VOICES = ["playful", "professional", "bold", "minimal"] as const;
export const POST_TYPES = [
  "ranking",
  "tips",
  "showcase",
  "problem_solution",
  "myth_fact",
  "before_after",
  "behind_scenes",
  "promo",
] as const;
export type PostType = (typeof POST_TYPES)[number];

export const POST_TYPE_INFO: Record<PostType, { label: string; emoji: string; example: string }> = {
  ranking: { label: "Top list / ranking", emoji: "🏆", example: "Top 5 burger spots in KL" },
  tips: { label: "Tips & how-to", emoji: "💡", example: "5 ways to order like a local" },
  showcase: { label: "Product showcase", emoji: "✨", example: "Everything our app can do" },
  problem_solution: { label: "Problem → solution", emoji: "🛠️", example: "Why you never know where to eat" },
  myth_fact: { label: "Myth vs fact", emoji: "🧐", example: "Food myths Malaysians believe" },
  before_after: { label: "Before / after", emoji: "🔁", example: "Picking dinner before vs. after" },
  behind_scenes: { label: "Behind the scenes", emoji: "🎬", example: "How we built our app" },
  promo: { label: "Offer / launch", emoji: "🎉", example: "We just launched in Penang" },
};

export const MIN_SLIDES = 3;
export const MAX_SLIDES = 10;
export const MAX_PHOTOS = 8;

export const BusinessInputSchema = z.object({
  businessName: z.string().trim().min(1).max(80),
  industry: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  audience: z.string().trim().min(1).max(300),
  features: z.array(z.string().trim().min(1).max(200)).min(1).max(3),
  goal: z.enum(GOALS),
  voice: z.enum(VOICES),
  slideCount: z.number().int().min(MIN_SLIDES).max(MAX_SLIDES),
  postType: z.enum(["auto", ...POST_TYPES]),
  topic: z.string().trim().max(200).optional(),
  website: z.string().trim().max(120).optional(),
});
export type BusinessInput = z.infer<typeof BusinessInputSchema>;

// Photos are downscaled JPEG data URLs (done in the browser before upload).
export const PhotoInputSchema = z.object({
  dataUrl: z.string().regex(/^data:image\/(jpeg|png);base64,/).max(2_000_000),
  label: z.string().trim().max(100).optional(),
});
export type PhotoInput = z.infer<typeof PhotoInputSchema>;

// ---------- Brand (render-only, never sent to the model) ----------

export const TEMPLATES = ["bold", "gradient", "minimal", "dark"] as const;
export type TemplateId = (typeof TEMPLATES)[number];

export const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = z.string().regex(HEX);

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
      "Short label above the headline. Hook: a 1-3 word category tag. Value: the rank or number label like '#1', '01' or 'Myth #1'. CTA: the button text like 'Download now'.",
    ),
  headline: z.string().describe("The main text of the slide. No emoji."),
  body: z.string().describe("Supporting text. Can be empty for the hook."),
  emoji: z.string().describe("One emoji character that fits the slide, or empty string."),
  chips: z
    .array(z.string())
    .describe("0-3 short info tags shown as pills, each under 22 characters, e.g. '📍 Bangsar', 'RM 25-40', '★ 4.7'."),
  imageIndex: z.number().describe("Index of the uploaded photo to show on this slide, or -1 for none."),
});
export type Slide = z.infer<typeof SlideSchema>;

export const PaletteSchema = z.object({
  primaryColor: z.string().describe("Hex like #1F3D2B. The dominant brand/background color."),
  secondaryColor: z.string().describe("Hex accent color that pops against the primary."),
  template: z.enum(TEMPLATES),
  reason: z.string().describe("One short sentence on why these colors fit."),
});
export type Palette = z.infer<typeof PaletteSchema>;

export const CarouselPlanSchema = z.object({
  postType: z.enum(POST_TYPES),
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
  palette: PaletteSchema,
});
export type CarouselPlan = z.infer<typeof CarouselPlanSchema>;

// ---------- API request bodies ----------

export const ResearchRequestSchema = z.object({
  input: BusinessInputSchema,
  // Labels of the user's photos ("Burger On 16"): places they want featured.
  photoLabels: z.array(z.string().trim().max(100)).max(MAX_PHOTOS).default([]),
});

export const GenerateRequestSchema = z.object({
  input: BusinessInputSchema,
  photos: z.array(PhotoInputSchema).max(MAX_PHOTOS),
  research: z.string().max(20_000).optional(),
});

export const SuggestPaletteRequestSchema = z.object({
  input: BusinessInputSchema.partial(),
  photos: z.array(PhotoInputSchema).max(MAX_PHOTOS),
});

export const RegenerateSlideRequestSchema = z.object({
  input: BusinessInputSchema,
  plan: CarouselPlanSchema,
  index: z.number().int().min(0).max(MAX_SLIDES - 1),
  instruction: z.string().max(300).optional(),
});

const RenderImageSchema = z.object({
  src: z.string().regex(/^data:image\/(jpeg|png|svg\+xml);base64,/),
  aspect: z.number().positive().max(10), // height / width
});
export type RenderImage = z.infer<typeof RenderImageSchema>;

export const RenderRequestSchema = z.object({
  slide: SlideSchema,
  index: z.number().int().min(0),
  total: z.number().int().min(1).max(MAX_SLIDES),
  brand: BrandSchema,
  businessName: z.string().max(80),
  postType: z.enum(POST_TYPES),
  image: RenderImageSchema.optional(),
  // Photos shown as a collage on a hook slide that has no photo of its own.
  collage: z.array(RenderImageSchema).max(3).optional(),
});
export type RenderRequest = z.infer<typeof RenderRequestSchema>;
