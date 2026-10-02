"use client";

import JSZip from "jszip";
import { useEffect, useRef, useState } from "react";
import {
  editPost,
  findImages,
  generatePlan,
  getImageSources,
  regenerateSlide,
  renderSlideImage,
  researchTopic,
  suggestPalette,
} from "@/lib/client-api";
import { creditText, importImage, photoAspect, type StudioPhoto } from "@/lib/photos";
import { applyEdit, type ImageJob } from "@/lib/post-edit";
import {
  BrandSchema,
  BusinessInputSchema,
  POST_TYPE_INFO,
  SlideSchema,
  type Brand,
  type BusinessInput,
  type CarouselPlan,
  type ImageCandidate,
  type ImageSources,
  type Palette,
  type PhotoInput,
  type RenderImage,
  type Slide,
} from "@/lib/schemas";
import { DEFAULT_BRAND, BrandPanel } from "./BrandPanel";
import { BusinessForm, EMPTY_INPUT, EXAMPLE_INPUT } from "./BusinessForm";
import { CaptionPanel, fullCaption } from "./CaptionPanel";
import { CarouselPreview } from "./CarouselPreview";
import { EditWithAI } from "./EditWithAI";
import { PhotoUploader } from "./PhotoUploader";
import { SlideEditor } from "./SlideEditor";
import { Button, Card, Spinner } from "./ui";

const STORAGE_KEY = "marketing-agent:v2";
const RENDER_DEBOUNCE_MS = 350;
const IMAGE_SEARCHES_AT_ONCE = 3;
const IMPORT_ATTEMPTS = 3;

// Slides reference photos by id on the client, so removing or reordering
// photos never points a slide at the wrong image.
type StudioSlide = Slide & { photoId: string | null };
type StudioPlan = Omit<CarouselPlan, "slides"> & { slides: StudioSlide[] };
type Phase = "idle" | "researching" | "writing" | "finding";
// Everything an AI edit can change, kept so the edit can be undone.
type Snapshot = { plan: StudioPlan; brand: Brand; found: StudioPhoto[]; autoColors: boolean; paletteReason?: string };

const IMAGE_HINTS: Record<"none" | "stock" | "web" | "both", string> = {
  none: "Add PEXELS_API_KEY (stock photos) or BRAVE_SEARCH_API_KEY (web images) to .env.local to turn this on.",
  stock: "Uses stock photos from Pexels. Add BRAVE_SEARCH_API_KEY to also find photos of specific places.",
  web: "Uses web images, which may be copyrighted. Add PEXELS_API_KEY for free-to-use stock photos.",
  both: "Stock photos for general slides, web images for specific places. Web images may be copyrighted; sources are listed in the download.",
};

function cleanInput(input: BusinessInput): BusinessInput {
  return {
    ...input,
    features: input.features.map((f) => f.trim()).filter(Boolean),
    topic: input.topic?.trim() || undefined,
    website: input.website?.trim() || undefined,
  };
}

const toPhotoInputs = (photos: StudioPhoto[]): PhotoInput[] =>
  photos.map((p) => ({ dataUrl: p.dataUrl, label: p.label.trim() || undefined }));

const toRenderImage = (p: StudioPhoto): RenderImage => ({ src: p.dataUrl, aspect: photoAspect(p) });

// Searches online and imports the first result that downloads cleanly.
async function findFirstImage({ index, query, kind }: ImageJob): Promise<StudioPhoto | null> {
  try {
    const { candidates } = await findImages(query, kind);
    for (const candidate of candidates.slice(0, IMPORT_ATTEMPTS)) {
      try {
        return await importImage(candidate, index, query);
      } catch {}
    }
  } catch {}
  return null;
}

// Restore the last business + brand (per-browser convenience only). Studio is
// rendered client-only (see StudioLoader), so localStorage is available here.
function loadSaved(): {
  input?: Partial<BusinessInput>;
  brand?: Partial<Brand>;
  autoColors?: boolean;
  autoImages?: boolean;
} {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") ?? {};
  } catch {
    return {};
  }
}

export default function Studio() {
  const [input, setInput] = useState<BusinessInput>(() => ({ ...EMPTY_INPUT, ...loadSaved().input }));
  const [brand, setBrand] = useState<Brand>(() => ({ ...DEFAULT_BRAND, ...loadSaved().brand }));
  const [autoColors, setAutoColors] = useState<boolean>(() => loadSaved().autoColors ?? true);
  const [paletteReason, setPaletteReason] = useState<string>();
  const [photos, setPhotos] = useState<StudioPhoto[]>([]);
  // Images found online for the current carousel; replaced on each generation.
  const [found, setFound] = useState<StudioPhoto[]>([]);
  const [autoImages, setAutoImages] = useState<boolean>(() => loadSaved().autoImages ?? false);
  const [sources, setSources] = useState<ImageSources>({ stock: false, web: false });
  const [plan, setPlan] = useState<StudioPlan | null>(null);
  const [images, setImages] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [suggesting, setSuggesting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [lastEdit, setLastEdit] = useState<{ summary: string; snapshot: Snapshot } | null>(null);

  // Per-slide render bookkeeping: what each image was rendered from, and a
  // version counter so a slow, stale render can't overwrite a newer one.
  const renderedKeys = useRef<string[]>([]);
  const renderVersions = useRef<number[]>([]);
  // Bumped whenever the post is replaced or rolled back, so image searches
  // still in flight for the old version don't attach to the new one.
  const generation = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ input, brand, autoColors, autoImages }));
    } catch {}
  }, [input, brand, autoColors, autoImages]);

  useEffect(() => {
    getImageSources().then(setSources).catch(() => {});
  }, []);

  // Re-render any slide whose content, photo or branding changed, debounced so
  // typing in the editor doesn't fire a request per keystroke.
  useEffect(() => {
    if (!plan || !BrandSchema.safeParse(brand).success) return;
    const total = plan.slides.length;
    const businessName = input.businessName || "Your brand";
    const byId = new Map([...photos, ...found].map((p) => [p.id, p]));

    // A cover without its own photo shows a collage of the post's photos.
    const used = plan.slides.map((s) => s.photoId).filter((id): id is string => !!id && byId.has(id));
    const collagePhotos = [...used, ...photos.map((p) => p.id).filter((id) => !used.includes(id))]
      .slice(0, 3)
      .map((id) => byId.get(id)!);

    const timer = setTimeout(() => {
      plan.slides.forEach(({ photoId, ...slide }, index) => {
        const photo = photoId ? byId.get(photoId) : undefined;
        const collage = slide.role === "hook" && !photo ? collagePhotos : [];
        const key = JSON.stringify({
          slide,
          photo: photo?.id,
          collage: collage.map((p) => p.id),
          total,
          brand,
          businessName,
          postType: plan.postType,
        });
        if (renderedKeys.current[index] === key) return;
        renderedKeys.current[index] = key;
        const version = (renderVersions.current[index] ?? 0) + 1;
        renderVersions.current[index] = version;

        renderSlideImage({
          slide,
          index,
          total,
          brand,
          businessName,
          postType: plan.postType,
          image: photo ? toRenderImage(photo) : undefined,
          collage: collage.length >= 2 ? collage.map(toRenderImage) : undefined,
        })
          .then((url) => {
            if (renderVersions.current[index] !== version) return URL.revokeObjectURL(url);
            setImages((prev) => {
              const next = [...prev];
              if (next[index]) URL.revokeObjectURL(next[index]!);
              next[index] = url;
              return next;
            });
          })
          .catch((e: Error) => {
            renderedKeys.current[index] = "";
            setError(e.message);
          });
      });
    }, RENDER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [plan, brand, input.businessName, photos, found]);

  function applyPalette(p: Palette) {
    setBrand((b) => ({ ...b, primaryColor: p.primaryColor, secondaryColor: p.secondaryColor, template: p.template }));
    setPaletteReason(p.reason);
  }

  // Picking colors or a template by hand switches off AI colors.
  function onBrandChange(next: Brand) {
    if (
      next.primaryColor !== brand.primaryColor ||
      next.secondaryColor !== brand.secondaryColor ||
      next.template !== brand.template
    ) {
      setAutoColors(false);
      setPaletteReason(undefined);
    }
    setBrand(next);
  }

  async function onSuggest() {
    setError(null);
    setSuggesting(true);
    try {
      applyPalette(await suggestPalette(cleanInput(input), toPhotoInputs(photos)));
      // Lock the suggestion in so the next generation doesn't replace it.
      setAutoColors(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSuggesting(false);
    }
  }

  async function onGenerate() {
    setError(null);
    const parsed = BusinessInputSchema.safeParse(cleanInput(input));
    if (!parsed.success) {
      setError("Fill in the business name, industry, description, audience and at least one feature.");
      return;
    }
    const data = parsed.data;
    const photosAtStart = photos;
    const gen = ++generation.current;
    setNotice(null);
    try {
      let notes: string | undefined;
      if (data.topic) {
        setPhase("researching");
        notes = await researchTopic(data, photosAtStart.map((p) => p.label.trim()).filter(Boolean));
      }
      setPhase("writing");
      const next = await generatePlan(data, toPhotoInputs(photosAtStart), notes);

      images.forEach((url) => url && URL.revokeObjectURL(url));
      renderedKeys.current = [];
      setImages(next.slides.map(() => null));
      setSelected(0);
      setEditorVersion((v) => v + 1);
      if (autoColors) applyPalette(next.palette);
      const slides = next.slides.map((s) => ({ ...s, photoId: photosAtStart[s.imageIndex]?.id ?? null }));
      setFound([]);
      setLastEdit(null);
      setPlan({ ...next, slides });

      // The carousel is already on screen; images drop in as they're found.
      if (autoImages && canFindImages) {
        setPhase("finding");
        const jobs = slides.flatMap((s, index): ImageJob[] =>
          !s.photoId && s.imageKind !== "none" && s.imageQuery ? [{ index, query: s.imageQuery, kind: s.imageKind }] : [],
        );
        reportMissing(await attachImages(jobs, gen));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhase("idle");
    }
  }

  function updateSlide(index: number, slide: Partial<StudioSlide>) {
    setPlan((p) => (p ? { ...p, slides: p.slides.map((s, i) => (i === index ? { ...s, ...slide } : s)) } : p));
  }

  // Finds an image for each job and puts it on its slide, a few at a time.
  // Returns the slides that ended up without one.
  async function attachImages(jobs: ImageJob[], gen: number): Promise<number[]> {
    const queue = [...jobs];
    const failed: number[] = [];
    async function worker() {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const photo = await findFirstImage(job);
        if (generation.current !== gen) return;
        if (!photo) {
          failed.push(job.index);
          continue;
        }
        setFound((f) => [...f, photo]);
        updateSlide(job.index, { photoId: photo.id });
      }
    }
    await Promise.all(Array.from({ length: IMAGE_SEARCHES_AT_ONCE }, worker));
    return generation.current === gen ? failed.sort((a, b) => a - b) : [];
  }

  function reportMissing(failed: number[]) {
    if (failed.length === 0) return;
    setNotice(
      `Couldn't find an image for slide${failed.length > 1 ? "s" : ""} ${failed.map((i) => i + 1).join(", ")}. Open the slide and use “Find images” to try another search.`,
    );
  }

  async function onPickImage(index: number, candidate: ImageCandidate, query: string) {
    const photo = await importImage(candidate, index, query);
    setFound((f) => [...f, photo]);
    updateSlide(index, { photoId: photo.id });
  }

  // Parsing strips the client-only photoId.
  const toApiPlan = (p: StudioPlan): CarouselPlan => ({ ...p, slides: p.slides.map((s) => SlideSchema.parse(s)) });

  // Returns whether the edit was applied.
  async function onEditPost(instruction: string): Promise<boolean> {
    if (!plan) return false;
    setError(null);
    setNotice(null);
    setEditing(true);
    const snapshot: Snapshot = { plan, brand, found, autoColors, paletteReason };
    try {
      const edit = await editPost({
        input: cleanInput(input),
        plan: toApiPlan(plan),
        brand: { template: brand.template, primaryColor: brand.primaryColor, secondaryColor: brand.secondaryColor },
        uploads: photos.map((p) => p.label.trim()),
        // The model sees what each slide's image is, not the picture itself.
        slideImages: plan.slides.map((s) => {
          const photo = allPhotos.find((p) => p.id === s.photoId);
          if (!photo) return { source: "none" as const, label: "" };
          if (photo.origin === "upload") {
            return { source: "upload" as const, label: `photo ${photos.indexOf(photo)}${photo.label ? `: ${photo.label}` : ""}` };
          }
          return { source: "found" as const, label: `${photo.origin} image for "${photo.label}"`.slice(0, 300) };
        }),
        instruction,
      });
      const result = applyEdit(
        plan,
        brand,
        edit,
        photos.map((p) => p.id),
      );
      const gen = ++generation.current;
      setPlan(result.plan);
      if (edit.palette) {
        setBrand(result.brand);
        setAutoColors(false);
        setPaletteReason(undefined);
      }
      setEditorVersion((v) => v + 1);
      setLastEdit({ summary: edit.summary || "Done.", snapshot });
      reportMissing(await attachImages(result.imageJobs, gen));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setEditing(false);
    }
  }

  function onUndoEdit() {
    if (!lastEdit) return;
    const { snapshot } = lastEdit;
    generation.current++;
    setPlan(snapshot.plan);
    setBrand(snapshot.brand);
    setFound(snapshot.found);
    setAutoColors(snapshot.autoColors);
    setPaletteReason(snapshot.paletteReason);
    setEditorVersion((v) => v + 1);
    setLastEdit(null);
    setNotice(null);
  }

  async function onRegenerate(index: number, instruction?: string) {
    if (!plan) return;
    setError(null);
    setRegenerating(index);
    try {
      const slide = await regenerateSlide(cleanInput(input), toApiPlan(plan), index, instruction);
      updateSlide(index, slide);
      setEditorVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRegenerating(null);
    }
  }

  async function onDownload() {
    if (!plan || images.some((u) => !u)) return;
    setDownloading(true);
    try {
      const zip = new JSZip();
      await Promise.all(
        images.map(async (url, i) => zip.file(`slide-${i + 1}.png`, await (await fetch(url!)).blob())),
      );
      zip.file("caption.txt", fullCaption(plan.caption, plan.hashtags));
      const credits = plan.slides.flatMap((s, i) => {
        const photo = allPhotos.find((p) => p.id === s.photoId);
        return photo?.credit ? [`Slide ${i + 1}: ${creditText(photo)} - ${photo.credit.pageUrl}`] : [];
      });
      if (credits.length > 0) {
        zip.file(
          "image-credits.txt",
          [
            "These slides use images found online. Web images may be copyrighted: check you have the right to use them before posting.",
            "",
            ...credits,
          ].join("\n"),
        );
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const slug = (input.businessName || "carousel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      a.download = `${slug || "carousel"}-instagram.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } finally {
      setDownloading(false);
    }
  }

  const busy = phase !== "idle";
  const allPhotos = [...photos, ...found];
  const canFindImages = sources.stock || sources.web;
  const imageHint = IMAGE_HINTS[sources.stock ? (sources.web ? "both" : "stock") : sources.web ? "web" : "none"];
  const allRendered = images.length > 0 && images.every(Boolean);
  const current = plan?.slides[selected];

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[440px_1fr]">
      {/* Left: inputs */}
      <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pb-2">
        <Card
          title="Your business & post"
          action={
            <button type="button" onClick={() => setInput(EXAMPLE_INPUT)} className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
              Fill example
            </button>
          }
        >
          <BusinessForm value={input} onChange={setInput} />
        </Card>
        <Card title="Photos">
          <PhotoUploader photos={photos} onChange={setPhotos} />
          <label className={`mt-4 flex items-start gap-2.5 border-t border-zinc-100 pt-4 ${canFindImages ? "cursor-pointer" : ""}`}>
            <input
              type="checkbox"
              checked={autoImages && canFindImages}
              disabled={!canFindImages}
              onChange={(e) => setAutoImages(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-zinc-900"
            />
            <span className="flex flex-col gap-0.5">
              <span className={`text-sm font-medium ${canFindImages ? "text-zinc-800" : "text-zinc-400"}`}>
                Let AI find images for slides without a photo
              </span>
              <span className="text-xs text-zinc-500">{imageHint}</span>
            </span>
          </label>
        </Card>
        <Card title="Brand style">
          <BrandPanel
            value={brand}
            onChange={onBrandChange}
            autoColors={autoColors}
            onAutoColorsChange={(auto) => {
              setAutoColors(auto);
              if (!auto) setPaletteReason(undefined);
            }}
            onSuggest={onSuggest}
            suggesting={suggesting}
            reason={paletteReason}
          />
        </Card>
        <Button onClick={onGenerate} disabled={busy || editing} className="py-3 text-base">
          {busy ? (
            <>
              <Spinner />{" "}
              {phase === "researching" ? "Researching…" : phase === "finding" ? "Finding images…" : "Writing your carousel…"}
            </>
          ) : plan ? (
            "Generate a new carousel"
          ) : (
            "Generate carousel"
          )}
        </Button>
      </div>

      {/* Right: output */}
      <div className="flex min-w-0 flex-col gap-6">
        {error ? (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-700" aria-label="Dismiss">
              ✕
            </button>
          </div>
        ) : null}

        {notice ? (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-amber-500 hover:text-amber-800" aria-label="Dismiss">
              ✕
            </button>
          </div>
        ) : null}

        {!plan || !current ? (
          <EmptyState phase={phase} topic={input.topic} />
        ) : (
          <>
            <Card
              title={`Carousel · ${POST_TYPE_INFO[plan.postType].label}`}
              action={
                <Button onClick={onDownload} disabled={!allRendered || downloading}>
                  {downloading ? <Spinner /> : "↓"} Download ZIP
                </Button>
              }
            >
              <div className="mb-6">
                <EditWithAI
                  editing={editing}
                  disabled={busy || regenerating !== null}
                  lastSummary={lastEdit?.summary}
                  onSubmit={onEditPost}
                  onUndo={onUndoEdit}
                />
              </div>
              <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,440px)_1fr]">
                <CarouselPreview images={images} selected={selected} onSelect={setSelected} />
                <SlideEditor
                  key={`${selected}-${editorVersion}`}
                  slide={current}
                  index={selected}
                  hookOptions={plan.hookOptions}
                  photos={allPhotos.filter((p) => p.origin === "upload" || p.slideIndex === selected)}
                  photoId={current.photoId && allPhotos.some((p) => p.id === current.photoId) ? current.photoId : null}
                  sources={sources}
                  regenerating={regenerating === selected || editing}
                  onChange={(s) => updateSlide(selected, s)}
                  onPhotoChange={(photoId) => updateSlide(selected, { photoId })}
                  onPickImage={(candidate, query) => onPickImage(selected, candidate, query)}
                  onRegenerate={(instruction) => onRegenerate(selected, instruction)}
                />
              </div>
            </Card>
            <Card title="Caption">
              <CaptionPanel
                caption={plan.caption}
                hashtags={plan.hashtags}
                onChange={(caption, hashtags) => setPlan({ ...plan, caption, hashtags })}
              />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ phase, topic }: { phase: Phase; topic?: string }) {
  return (
    <div className="flex min-h-[520px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
      {phase !== "idle" ? (
        <>
          <Spinner className="h-6 w-6 text-zinc-500" />
          <div>
            <p className="font-medium text-zinc-900">
              {phase === "researching" ? `Researching “${topic}” on the web…` : "Writing hooks, slides and caption…"}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {phase === "researching" ? "Step 1 of 2 · finding real, current picks" : "Usually 15–30 seconds"}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-[4/5] w-16 rounded-lg bg-zinc-100" style={{ opacity: 1 - i * 0.25 }} />
            ))}
          </div>
          <div>
            <p className="font-medium text-zinc-900">Your carousel will appear here</p>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              Describe your business, pick a post type and add photos. You&apos;ll get a ready-to-post Instagram carousel
              with a scroll-stopping cover, content slides and a call to action.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
