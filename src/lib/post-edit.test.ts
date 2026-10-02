import { describe, expect, it } from "vitest";
import { applyEdit, normalizeEdit } from "./post-edit";
import type { Brand, PostEdit, PostEditOutput, Slide } from "./schemas";

const slide = (headline: string, photoId: string | null = null): Slide & { photoId: string | null } => ({
  role: "value",
  kicker: "#1",
  headline,
  body: "body",
  emoji: "🍔",
  chips: ["📍 Bangsar"],
  imageIndex: -1,
  imageQuery: "",
  imageKind: "none",
  photoId,
});

const brand: Brand = { template: "bold", primaryColor: "#111111", secondaryColor: "#EEEEEE", handle: "me" };
const plan = { slides: [slide("one", "up-a"), slide("two"), slide("three", "found-1")], caption: "cap", hashtags: ["#a"] };

const change = (index: number, image: Partial<PostEdit["slides"][number]["image"]> = {}): PostEdit["slides"][number] => ({
  index,
  kicker: "new kicker",
  headline: "new headline",
  body: "new body",
  emoji: "🔥",
  chips: [],
  image: { action: "keep", uploadIndex: -1, query: "", kind: "stock", ...image },
});

const edit = (over: Partial<PostEdit>): PostEdit => ({ summary: "", slides: [], palette: null, caption: null, hashtags: null, ...over });

describe("applyEdit", () => {
  it("leaves everything alone for an empty edit", () => {
    const result = applyEdit(plan, brand, edit({}), ["up-a", "up-b"]);
    expect(result.plan).toEqual(plan);
    expect(result.plan.slides[0]).toBe(plan.slides[0]);
    expect(result.brand).toBe(brand);
    expect(result.imageJobs).toEqual([]);
  });

  it("changes only the listed slide and keeps its image", () => {
    const result = applyEdit(plan, brand, edit({ slides: [change(0)] }), ["up-a"]);
    expect(result.plan.slides[0]).toMatchObject({ headline: "new headline", emoji: "🔥", chips: [], photoId: "up-a", role: "value" });
    expect(result.plan.slides[1]).toBe(plan.slides[1]);
    expect(result.plan.slides[2]).toBe(plan.slides[2]);
  });

  it("removes an image", () => {
    const result = applyEdit(plan, brand, edit({ slides: [change(2, { action: "remove" })] }), []);
    expect(result.plan.slides[2].photoId).toBeNull();
  });

  it("switches to an uploaded photo", () => {
    const result = applyEdit(plan, brand, edit({ slides: [change(1, { action: "upload", uploadIndex: 1 })] }), ["up-a", "up-b"]);
    expect(result.plan.slides[1].photoId).toBe("up-b");
  });

  it("turns a find action into an image job and keeps the current image meanwhile", () => {
    const result = applyEdit(plan, brand, edit({ slides: [change(2, { action: "find", query: "moody burger", kind: "web" })] }), []);
    expect(result.imageJobs).toEqual([{ index: 2, query: "moody burger", kind: "web" }]);
    expect(result.plan.slides[2]).toMatchObject({ photoId: "found-1", imageQuery: "moody burger", imageKind: "web" });
  });

  it("applies palette, caption and hashtags only when present", () => {
    const result = applyEdit(
      plan,
      brand,
      edit({ palette: { primaryColor: "#000000", secondaryColor: "#FF0000", template: "dark" }, caption: "shorter" }),
      [],
    );
    expect(result.brand).toEqual({ ...brand, primaryColor: "#000000", secondaryColor: "#FF0000", template: "dark" });
    expect(result.plan.caption).toBe("shorter");
    expect(result.plan.hashtags).toBe(plan.hashtags);
    expect(result.plan.slides).toEqual(plan.slides);
  });
});

describe("normalizeEdit", () => {
  const ctx = { slideCount: 3, uploadCount: 2, brand };
  const output = (over: Partial<PostEditOutput>): PostEditOutput => ({
    summary: " done ",
    slides: [],
    palette: { change: false, primaryColor: "", secondaryColor: "", template: "bold" },
    caption: { change: false, text: "ignored" },
    hashtags: { change: false, tags: ["ignored"] },
    ...over,
  });

  it("maps unchanged parts to null", () => {
    expect(normalizeEdit(output({}), ctx)).toEqual({ summary: "done", slides: [], palette: null, caption: null, hashtags: null });
  });

  it("drops out-of-range, fractional and duplicate slide indexes", () => {
    const slides = [change(1), change(3), change(-1), change(0.5), { ...change(1), headline: "dupe" }];
    const result = normalizeEdit(output({ slides }), ctx);
    expect(result.slides.map((s) => [s.index, s.headline])).toEqual([[1, "new headline"]]);
  });

  it("falls back to keep for an invalid upload index or an empty search query", () => {
    const slides = [
      change(0, { action: "upload", uploadIndex: 2 }),
      change(1, { action: "find", query: "   " }),
      change(2, { action: "upload", uploadIndex: 1 }),
    ];
    expect(normalizeEdit(output({ slides }), ctx).slides.map((s) => s.image.action)).toEqual(["keep", "keep", "upload"]);
  });

  it("cleans emoji, chips, hashtags and colors", () => {
    const result = normalizeEdit(
      output({
        slides: [{ ...change(0), emoji: "abc", chips: [" a ", "", "b", "c", "d"] }],
        palette: { change: true, primaryColor: "#0a0a0a", secondaryColor: "red", template: "dark" },
        caption: { change: true, text: " new caption " },
        hashtags: { change: true, tags: ["kl food", "##burgers", "#"] },
      }),
      ctx,
    );
    expect(result.slides[0]).toMatchObject({ emoji: "", chips: ["a", "b", "c"] });
    expect(result.palette).toEqual({ primaryColor: "#0A0A0A", secondaryColor: "#EEEEEE", template: "dark" });
    expect(result.caption).toBe("new caption");
    expect(result.hashtags).toEqual(["#klfood", "#burgers"]);
  });
});
