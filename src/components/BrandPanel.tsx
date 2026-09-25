"use client";

import { useState } from "react";
import { TEMPLATES, type Brand } from "@/lib/schemas";
import { TEMPLATE_LABELS } from "@/lib/templates";
import { Button, Field, Input, Segmented, Spinner } from "./ui";

export const DEFAULT_BRAND: Brand = {
  template: "bold",
  primaryColor: "#1F3D2B",
  secondaryColor: "#F2B84B",
  handle: "",
};

const MAX_LOGO_BYTES = 1_000_000;

// Tiny static previews of each template so the picker is visual.
function TemplateSwatch({ id, brand }: { id: Brand["template"]; brand: Brand }) {
  const bg = {
    bold: brand.primaryColor,
    gradient: `linear-gradient(145deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
    minimal: "#FAF7F2",
    dark: "#0C0C10",
  }[id];
  const bar = { bold: brand.secondaryColor, gradient: "#ffffff", minimal: brand.primaryColor, dark: brand.primaryColor }[id];
  return (
    <div className="flex aspect-[4/5] w-full flex-col justify-center gap-1 rounded-md p-2" style={{ background: bg }}>
      <div className="h-1 w-1/3 rounded-full" style={{ background: bar }} />
      <div className="h-2 w-5/6 rounded-sm bg-current opacity-80" style={{ color: id === "minimal" ? "#111" : "#fff" }} />
      <div className="h-2 w-2/3 rounded-sm bg-current opacity-80" style={{ color: id === "minimal" ? "#111" : "#fff" }} />
    </div>
  );
}

export function BrandPanel({
  value,
  onChange,
  autoColors,
  onAutoColorsChange,
  onSuggest,
  suggesting,
  reason,
}: {
  value: Brand;
  onChange: (next: Brand) => void;
  autoColors: boolean;
  onAutoColorsChange: (auto: boolean) => void;
  onSuggest: () => void;
  suggesting: boolean;
  reason?: string;
}) {
  const [logoError, setLogoError] = useState<string | null>(null);
  const set = <K extends keyof Brand>(key: K, v: Brand[K]) => onChange({ ...value, [key]: v });

  function onLogo(file: File | undefined) {
    setLogoError(null);
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Logo must be under 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("logoDataUrl", String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Colors & style">
        <Segmented
          value={autoColors ? "auto" : "custom"}
          onChange={(v) => onAutoColorsChange(v === "auto")}
          options={[
            { value: "auto", label: "✨ Let AI pick" },
            { value: "custom", label: "Choose myself" },
          ]}
        />
      </Field>
      <div className="flex items-start justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2.5">
        <p className="text-xs leading-relaxed text-zinc-600">
          {reason
            ? reason
            : autoColors
              ? "The AI picks colors and a template from your description and photos when you generate."
              : "Pick a template and colors below, or ask the AI for a suggestion."}
        </p>
        <Button variant="secondary" onClick={onSuggest} disabled={suggesting} className="shrink-0 px-3 py-1.5 text-xs">
          {suggesting ? <Spinner className="h-3 w-3" /> : "✨"} Suggest now
        </Button>
      </div>

      <Field label="Template">
        <div className="grid grid-cols-4 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("template", t)}
              className={`flex flex-col gap-1.5 rounded-lg p-1.5 text-xs transition ${
                value.template === t ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              <TemplateSwatch id={t} brand={value} />
              {TEMPLATE_LABELS[t]}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        {(["primaryColor", "secondaryColor"] as const).map((key) => (
          <Field key={key} label={key === "primaryColor" ? "Primary color" : "Accent color"}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={value[key]}
                onChange={(e) => set(key, e.target.value.toUpperCase())}
                className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-zinc-200 bg-white p-0.5"
              />
              <Input
                value={value[key]}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) set(key, v.length === 7 ? v.toUpperCase() : (v as string));
                }}
                className="font-mono"
              />
            </div>
          </Field>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Instagram handle" hint="optional">
          <Input value={value.handle ?? ""} onChange={(e) => set("handle", e.target.value.replace(/^@/, ""))} placeholder="yourbrand" maxLength={40} />
        </Field>
        <Field label="Logo" hint="optional">
          {value.logoDataUrl ? (
            <div className="flex h-9 items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value.logoDataUrl} alt="Logo" className="h-9 max-w-24 rounded border border-zinc-200 object-contain" />
              <button type="button" onClick={() => set("logoDataUrl", undefined)} className="text-sm text-zinc-500 hover:text-zinc-900">
                Remove
              </button>
            </div>
          ) : (
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={(e) => onLogo(e.target.files?.[0])}
              className="text-sm text-zinc-500 file:mr-2 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
            />
          )}
          {logoError ? <span className="text-xs text-red-600">{logoError}</span> : null}
        </Field>
      </div>
    </div>
  );
}
