"use client";

import { FORMAT_LABELS, FORMATS, GOALS, VOICES, type BusinessInput } from "@/lib/schemas";
import { Field, Input, Segmented, Select, Textarea } from "./ui";

export const EMPTY_INPUT: BusinessInput = {
  businessName: "",
  industry: "",
  description: "",
  audience: "",
  features: [""],
  goal: "engagement",
  voice: "playful",
  slideCount: 5,
  format: "auto",
  website: "",
};

export const EXAMPLE_INPUT: BusinessInput = {
  businessName: "Grounded Coffee Co.",
  industry: "Specialty coffee roaster",
  description:
    "Small-batch roaster that ships freshly roasted beans within 48 hours, with a subscription that adapts to how you brew.",
  audience: "Busy young professionals who want café-quality coffee at home but find specialty coffee intimidating",
  features: [
    "Roasted-to-order beans shipped within 48 hours",
    "Brew-method quiz that picks your grind and beans",
    "Flexible subscription: skip or swap anytime",
  ],
  goal: "sales",
  voice: "playful",
  slideCount: 5,
  format: "auto",
  website: "groundedcoffee.co",
};

export function BusinessForm({
  value,
  onChange,
}: {
  value: BusinessInput;
  onChange: (next: BusinessInput) => void;
}) {
  const set = <K extends keyof BusinessInput>(key: K, v: BusinessInput[K]) => onChange({ ...value, [key]: v });

  const setFeature = (i: number, text: string) =>
    set(
      "features",
      value.features.map((f, j) => (j === i ? text : f)),
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Business name">
          <Input value={value.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="Grounded Coffee Co." maxLength={80} />
        </Field>
        <Field label="Industry">
          <Input value={value.industry} onChange={(e) => set("industry", e.target.value)} placeholder="Coffee roaster" maxLength={80} />
        </Field>
      </div>

      <Field label="What does it do?">
        <Textarea
          rows={3}
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="One or two sentences about the business or idea"
          maxLength={500}
        />
      </Field>

      <Field label="Target audience" hint="who + what they struggle with">
        <Textarea
          rows={2}
          value={value.audience}
          onChange={(e) => set("audience", e.target.value)}
          placeholder="Busy professionals who want café coffee at home"
          maxLength={300}
        />
      </Field>

      <Field label="Features to promote" hint="1–3">
        <div className="flex flex-col gap-2">
          {value.features.map((f, i) => (
            <div key={i} className="flex gap-2">
              <Input value={f} onChange={(e) => setFeature(i, e.target.value)} placeholder={`Feature ${i + 1}`} maxLength={200} />
              {value.features.length > 1 ? (
                <button
                  type="button"
                  onClick={() => set("features", value.features.filter((_, j) => j !== i))}
                  className="rounded-lg px-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  aria-label={`Remove feature ${i + 1}`}
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
          {value.features.length < 3 ? (
            <button
              type="button"
              onClick={() => set("features", [...value.features, ""])}
              className="self-start text-sm font-medium text-zinc-500 hover:text-zinc-900"
            >
              + Add feature
            </button>
          ) : null}
        </div>
      </Field>

      <Field label="Goal">
        <Segmented value={value.goal} onChange={(v) => set("goal", v)} options={GOALS.map((g) => ({ value: g, label: g }))} />
      </Field>

      <Field label="Brand voice">
        <Segmented value={value.voice} onChange={(v) => set("voice", v)} options={VOICES.map((v) => ({ value: v, label: v }))} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Format">
          <Select value={value.format} onChange={(e) => set("format", e.target.value as BusinessInput["format"])}>
            <option value="auto">Let AI choose</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Slides">
          <Segmented value={value.slideCount} onChange={(v) => set("slideCount", v)} options={[3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
        </Field>
      </div>

      <Field label="Website" hint="optional">
        <Input value={value.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="example.com" maxLength={120} />
      </Field>
    </div>
  );
}
