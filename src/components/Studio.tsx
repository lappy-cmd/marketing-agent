"use client";

import JSZip from "jszip";
import { useEffect, useRef, useState } from "react";
import { generatePlan, regenerateSlide, renderSlideImage, researchTopic, suggestPalette } from "@/lib/client-api";
import { photoAspect, type StudioPhoto } from "@/lib/photos";
import {
  BrandSchema,
  BusinessInputSchema,
  POST_TYPE_INFO,
  SlideSchema,
  type Brand,
  type BusinessInput,
  type CarouselPlan,
  type Palette,
  type PhotoInput,
  type RenderImage,
  type Slide,
} from "@/lib/schemas";
import { DEFAULT_BRAND, BrandPanel } from "./BrandPanel";
import { BusinessForm, EMPTY_INPUT, EXAMPLE_INPUT } from "./BusinessForm";
import { CaptionPanel, fullCaption } from "./CaptionPanel";
import { CarouselPreview } from "./CarouselPreview";
import { PhotoUploader } from "./PhotoUploader";
import { SlideEditor } from "./SlideEditor";
import { Button, Card, Spinner } from "./ui";

const STORAGE_KEY = "marketing-agent:v2";
const RENDER_DEBOUNCE_MS = 350;

// Slides reference photos by id on the client, so removing or reordering
// photos never points a slide at the wrong image.
type StudioSlide = Slide & { photoId: string | null };
type StudioPlan = Omit<CarouselPlan, "slides"> & { slides: StudioSlide[] };
type Phase = "idle" | "researching" | "writing";

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

// Restore the last business + brand (per-browser convenience only). Studio is
// rendered client-only (see StudioLoader), so localStorage is available here.
function loadSaved(): { input?: Partial<BusinessInput>; brand?: Partial<Brand>; autoColors?: boolean } {
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
  const [plan, setPlan] = useState<StudioPlan | null>(null);
  const [images, setImages] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [suggesting, setSuggesting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-slide render bookkeeping: what each image was rendered from, and a
  // version counter so a slow, stale render can't overwrite a newer one.
  const renderedKeys = useRef<string[]>([]);
  const renderVersions = useRef<number[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ input, brand, autoColors }));
    } catch {}
  }, [input, brand, autoColors]);

  // Re-render any slide whose content, photo or branding changed, debounced so
  // typing in the editor doesn't fire a request per keystroke.
  useEffect(() => {
    if (!plan || !BrandSchema.safeParse(brand).success) return;
    const total = plan.slides.length;
    const businessName = input.businessName || "Your brand";
    const byId = new Map(photos.map((p) => [p.id, p]));

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
  }, [plan, brand, input.businessName, photos]);

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
      setPlan({
        ...next,
        slides: next.slides.map((s) => ({ ...s, photoId: photosAtStart[s.imageIndex]?.id ?? null })),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhase("idle");
    }
  }

  function updateSlide(index: number, slide: Partial<StudioSlide>) {
    setPlan((p) => (p ? { ...p, slides: p.slides.map((s, i) => (i === index ? { ...s, ...slide } : s)) } : p));
  }

  async function onRegenerate(index: number, instruction?: string) {
    if (!plan) return;
    setError(null);
    setRegenerating(index);
    try {
      // Parsing strips the client-only photoId.
      const apiPlan: CarouselPlan = { ...plan, slides: plan.slides.map((s) => SlideSchema.parse(s)) };
      const slide = await regenerateSlide(cleanInput(input), apiPlan, index, instruction);
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
        <Button onClick={onGenerate} disabled={busy} className="py-3 text-base">
          {busy ? (
            <>
              <Spinner /> {phase === "researching" ? "Researching…" : "Writing your carousel…"}
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
              <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,440px)_1fr]">
                <CarouselPreview images={images} selected={selected} onSelect={setSelected} />
                <SlideEditor
                  key={`${selected}-${editorVersion}`}
                  slide={current}
                  index={selected}
                  hookOptions={plan.hookOptions}
                  photos={photos}
                  photoId={current.photoId && photos.some((p) => p.id === current.photoId) ? current.photoId : null}
                  regenerating={regenerating === selected}
                  onChange={(s) => updateSlide(selected, s)}
                  onPhotoChange={(photoId) => updateSlide(selected, { photoId })}
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
