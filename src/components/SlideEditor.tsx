"use client";

import { useState } from "react";
import { creditText, type StudioPhoto } from "@/lib/photos";
import type { CarouselPlan, ImageCandidate, ImageSources, Slide } from "@/lib/schemas";
import { ImagePicker } from "./ImagePicker";
import { Button, Field, Input, Spinner, Textarea } from "./ui";

const ROLE_LABELS: Record<Slide["role"], string> = { hook: "Cover", value: "Content", cta: "Call to action" };
const KICKER_LABELS: Record<Slide["role"], string> = { hook: "Tag", value: "Number / label", cta: "Button text" };

export function SlideEditor({
  slide,
  index,
  hookOptions,
  photos,
  photoId,
  sources,
  regenerating,
  onChange,
  onPhotoChange,
  onPickImage,
  onRegenerate,
}: {
  slide: Slide;
  index: number;
  hookOptions: CarouselPlan["hookOptions"];
  // Uploads plus the images found online for this slide.
  photos: StudioPhoto[];
  photoId: string | null;
  sources: ImageSources;
  regenerating: boolean;
  onChange: (next: Slide) => void;
  onPhotoChange: (photoId: string | null) => void;
  onPickImage: (candidate: ImageCandidate, query: string) => Promise<void>;
  onRegenerate: (instruction?: string) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [chipsText, setChipsText] = useState(slide.chips.join(", "));
  const set = <K extends keyof Slide>(key: K, v: Slide[K]) => onChange({ ...slide, [key]: v });
  const words = slide.headline.trim().split(/\s+/).filter(Boolean).length;
  const current = photos.find((p) => p.id === photoId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">
        Slide {index + 1} · {ROLE_LABELS[slide.role]}
      </div>

      {photos.length > 0 ? (
        <Field label="Photo">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onPhotoChange(null)}
              className={`flex h-12 w-12 items-center justify-center rounded-md border text-[10px] font-medium ${
                photoId === null ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-500 hover:border-zinc-400"
              }`}
            >
              None
            </button>
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPhotoChange(p.id)}
                title={p.credit ? `${p.label} (${creditText(p)})` : p.label}
                className={`relative h-12 w-12 overflow-hidden rounded-md ring-2 ring-offset-1 transition ${
                  photoId === p.id ? "ring-zinc-900" : "ring-transparent opacity-70 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt={p.label} className="h-full w-full object-cover" />
                {p.origin !== "upload" ? (
                  <span className="absolute right-0 bottom-0 rounded-tl bg-black/70 px-1 text-[8px] font-medium text-white uppercase">
                    {p.origin}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </Field>
      ) : null}

      {current?.credit ? (
        <p className="-mt-2 text-xs text-zinc-500">
          Image:{" "}
          <a href={current.credit.pageUrl} target="_blank" rel="noreferrer" className="underline hover:text-zinc-800">
            {creditText(current)}
          </a>
        </p>
      ) : null}

      <ImagePicker
        defaultQuery={slide.imageQuery || slide.headline}
        defaultKind={slide.imageKind === "web" ? "web" : "stock"}
        sources={sources}
        onPick={onPickImage}
      />

      <div className="grid grid-cols-[1fr_80px] gap-3">
        <Field label={KICKER_LABELS[slide.role]}>
          <Input value={slide.kicker} onChange={(e) => set("kicker", e.target.value)} maxLength={40} />
        </Field>
        <Field label="Emoji">
          <Input value={slide.emoji} onChange={(e) => set("emoji", e.target.value)} maxLength={8} className="text-center text-lg leading-5" />
        </Field>
      </div>

      <Field label="Headline" hint={`${words} words`}>
        <Textarea rows={2} value={slide.headline} onChange={(e) => set("headline", e.target.value)} maxLength={120} />
      </Field>

      <Field label="Body">
        <Textarea rows={3} value={slide.body} onChange={(e) => set("body", e.target.value)} maxLength={240} />
      </Field>

      <Field label="Info chips" hint="comma-separated, up to 3">
        <Input
          value={chipsText}
          onChange={(e) => {
            setChipsText(e.target.value);
            set(
              "chips",
              e.target.value
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean)
                .slice(0, 3),
            );
          }}
          placeholder="📍 Bangsar, 💸 RM 25-40, ⭐ 4.7"
          maxLength={90}
        />
      </Field>

      {slide.role === "hook" && hookOptions.length > 1 ? (
        <Field label="Alternative hooks" hint="click to use">
          <div className="flex flex-col gap-1.5">
            {hookOptions.map((h) => (
              <button
                key={h.text}
                type="button"
                onClick={() => set("headline", h.text)}
                title={h.reason}
                className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                  h.text === slide.headline ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-400"
                }`}
              >
                <span className="text-zinc-800">{h.text}</span>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{h.score}/10</span>
              </button>
            ))}
          </div>
        </Field>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-4">
        <span className="text-sm font-medium text-zinc-800">Rewrite with AI</span>
        <div className="flex gap-2">
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Optional: “make it punchier”, “mention free shipping”…"
            maxLength={300}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !regenerating) onRegenerate(instruction.trim() || undefined);
            }}
          />
          <Button variant="secondary" disabled={regenerating} onClick={() => onRegenerate(instruction.trim() || undefined)} className="shrink-0">
            {regenerating ? <Spinner /> : "↻"} Rewrite
          </Button>
        </div>
      </div>
    </div>
  );
}
