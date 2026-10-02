// Pure logic for "Ask AI to change…": cleaning the model's edit and applying
// it to the post. No server or browser APIs, so both sides can use it.
import { cleanChips, cleanEmoji, cleanHashtags, cleanPalette } from "./clean";
import type { Brand, ImageSource, PostEdit, PostEditOutput, Slide } from "./schemas";

export interface ImageJob {
  index: number;
  query: string;
  kind: ImageSource;
}

const MAX_QUERY = 200;

// Drops anything the model got structurally wrong so applyEdit can trust it.
export function normalizeEdit(
  out: PostEditOutput,
  ctx: { slideCount: number; uploadCount: number; brand: Pick<Brand, "primaryColor" | "secondaryColor"> },
): PostEdit {
  const seen = new Set<number>();
  const slides = out.slides
    .filter(({ index }) => {
      if (!Number.isInteger(index) || index < 0 || index >= ctx.slideCount || seen.has(index)) return false;
      seen.add(index);
      return true;
    })
    .map((s) => {
      const query = s.image.query.trim().slice(0, MAX_QUERY);
      const validUpload = Number.isInteger(s.image.uploadIndex) && s.image.uploadIndex >= 0 && s.image.uploadIndex < ctx.uploadCount;
      const unusable = (s.image.action === "upload" && !validUpload) || (s.image.action === "find" && !query);
      return {
        ...s,
        emoji: cleanEmoji(s.emoji),
        chips: cleanChips(s.chips),
        image: { ...s.image, query, action: unusable ? ("keep" as const) : s.image.action },
      };
    });

  const { change, ...palette } = out.palette;
  return {
    summary: out.summary.trim(),
    slides,
    palette: change ? cleanPalette(palette, ctx.brand) : null,
    caption: out.caption.change && out.caption.text.trim() ? out.caption.text.trim() : null,
    hashtags: out.hashtags.change ? cleanHashtags(out.hashtags.tags) : null,
  };
}

type EditableSlide = Slide & { photoId: string | null };
interface EditablePlan<S extends EditableSlide> {
  slides: S[];
  caption: string;
  hashtags: string[];
}

// Applies an edit without touching anything it doesn't mention. "find" image
// actions come back as jobs: the caller searches and attaches those images.
export function applyEdit<S extends EditableSlide, P extends EditablePlan<S>>(
  plan: P,
  brand: Brand,
  edit: PostEdit,
  uploadIds: string[],
): { plan: P; brand: Brand; imageJobs: ImageJob[] } {
  const byIndex = new Map(edit.slides.map((s) => [s.index, s]));
  const imageJobs: ImageJob[] = [];

  const slides = plan.slides.map((slide, index): S => {
    const change = byIndex.get(index);
    if (!change) return slide;
    const { kicker, headline, body, emoji, chips, image } = change;
    const next: S = { ...slide, kicker, headline, body, emoji, chips };
    if (image.action === "remove") next.photoId = null;
    if (image.action === "upload") next.photoId = uploadIds[image.uploadIndex] ?? slide.photoId;
    if (image.action === "find") {
      next.imageQuery = image.query;
      next.imageKind = image.kind;
      imageJobs.push({ index, query: image.query, kind: image.kind });
    }
    return next;
  });

  return {
    plan: { ...plan, slides, caption: edit.caption ?? plan.caption, hashtags: edit.hashtags ?? plan.hashtags },
    brand: edit.palette ? { ...brand, ...edit.palette } : brand,
    imageJobs,
  };
}
