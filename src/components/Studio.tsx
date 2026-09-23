"use client";

import JSZip from "jszip";
import { useEffect, useRef, useState } from "react";
import { generatePlan, regenerateSlide, renderSlideImage } from "@/lib/client-api";
import { BrandSchema, BusinessInputSchema, type Brand, type BusinessInput, type CarouselPlan, type Slide } from "@/lib/schemas";
import { DEFAULT_BRAND, BrandPanel } from "./BrandPanel";
import { BusinessForm, EMPTY_INPUT, EXAMPLE_INPUT } from "./BusinessForm";
import { CaptionPanel, fullCaption } from "./CaptionPanel";
import { CarouselPreview } from "./CarouselPreview";
import { SlideEditor } from "./SlideEditor";
import { Button, Card, Spinner } from "./ui";

const STORAGE_KEY = "marketing-agent:v1";
const RENDER_DEBOUNCE_MS = 350;

function cleanInput(input: BusinessInput): BusinessInput {
  return { ...input, features: input.features.map((f) => f.trim()).filter(Boolean), website: input.website?.trim() || undefined };
}

// Restore the last business + brand (per-browser convenience only). Studio is
// rendered client-only (see StudioLoader), so localStorage is available here.
function loadSaved(): { input?: Partial<BusinessInput>; brand?: Partial<Brand> } {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") ?? {};
  } catch {
    return {};
  }
}

export default function Studio() {
  const [input, setInput] = useState<BusinessInput>(() => ({ ...EMPTY_INPUT, ...loadSaved().input }));
  const [brand, setBrand] = useState<Brand>(() => ({ ...DEFAULT_BRAND, ...loadSaved().brand }));
  const [plan, setPlan] = useState<CarouselPlan | null>(null);
  const [images, setImages] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-slide render bookkeeping: what each image was rendered from, and a
  // version counter so a slow, stale render can't overwrite a newer one.
  const renderedKeys = useRef<string[]>([]);
  const renderVersions = useRef<number[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ input, brand }));
    } catch {}
  }, [input, brand]);

  // Re-render any slide whose content or branding changed, debounced so typing
  // in the editor doesn't fire a request per keystroke.
  useEffect(() => {
    if (!plan || !BrandSchema.safeParse(brand).success) return;
    const total = plan.slides.length;
    const businessName = input.businessName || "Your brand";

    const timer = setTimeout(() => {
      plan.slides.forEach((slide, index) => {
        const key = JSON.stringify({ slide, total, brand, businessName });
        if (renderedKeys.current[index] === key) return;
        renderedKeys.current[index] = key;
        const version = (renderVersions.current[index] ?? 0) + 1;
        renderVersions.current[index] = version;

        renderSlideImage({ slide, index, total, brand, businessName })
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
  }, [plan, brand, input.businessName]);

  async function onGenerate() {
    setError(null);
    const parsed = BusinessInputSchema.safeParse(cleanInput(input));
    if (!parsed.success) {
      setError("Fill in the business name, industry, description, audience and at least one feature.");
      return;
    }
    setGenerating(true);
    try {
      const next = await generatePlan(parsed.data);
      images.forEach((url) => url && URL.revokeObjectURL(url));
      renderedKeys.current = [];
      setImages(next.slides.map(() => null));
      setSelected(0);
      setPlan(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function updateSlide(index: number, slide: Slide) {
    setPlan((p) => (p ? { ...p, slides: p.slides.map((s, i) => (i === index ? slide : s)) } : p));
  }

  async function onRegenerate(index: number, instruction?: string) {
    if (!plan) return;
    setError(null);
    setRegenerating(index);
    try {
      const slide = await regenerateSlide(cleanInput(input), plan, index, instruction);
      updateSlide(index, slide);
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

  const allRendered = images.length > 0 && images.every(Boolean);

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[440px_1fr]">
      {/* Left: inputs */}
      <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pb-2">
        <Card
          title="Your business"
          action={
            <button type="button" onClick={() => setInput(EXAMPLE_INPUT)} className="text-xs font-medium text-zinc-500 hover:text-zinc-900">
              Fill example
            </button>
          }
        >
          <BusinessForm value={input} onChange={setInput} />
        </Card>
        <Card title="Brand style">
          <BrandPanel value={brand} onChange={setBrand} />
        </Card>
        <Button onClick={onGenerate} disabled={generating} className="py-3 text-base">
          {generating ? (
            <>
              <Spinner /> Writing your carousel…
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

        {!plan ? (
          <EmptyState generating={generating} />
        ) : (
          <>
            <Card
              title={`Carousel · ${plan.format.replace(/_/g, " ")}`}
              action={
                <Button onClick={onDownload} disabled={!allRendered || downloading}>
                  {downloading ? <Spinner /> : "↓"} Download ZIP
                </Button>
              }
            >
              <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,440px)_1fr]">
                <CarouselPreview images={images} selected={selected} onSelect={setSelected} />
                <SlideEditor
                  key={selected}
                  slide={plan.slides[selected]}
                  index={selected}
                  hookOptions={plan.hookOptions}
                  regenerating={regenerating === selected}
                  onChange={(s) => updateSlide(selected, s)}
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

function EmptyState({ generating }: { generating: boolean }) {
  return (
    <div className="flex min-h-[520px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
      {generating ? (
        <>
          <Spinner className="h-6 w-6 text-zinc-500" />
          <div>
            <p className="font-medium text-zinc-900">Writing hooks, slides and caption…</p>
            <p className="mt-1 text-sm text-zinc-500">This usually takes 20–40 seconds.</p>
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
              Describe your business on the left and get a 3–5 slide Instagram post built to earn saves and shares: a
              scroll-stopping hook, value slides and a clear call to action.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
