"use client";

import { GOALS, MAX_SLIDES, MIN_SLIDES, POST_TYPE_INFO, POST_TYPES, VOICES, type BusinessInput } from "@/lib/schemas";
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
  postType: "auto",
  topic: "",
  website: "",
};

export const EXAMPLE_INPUT: BusinessInput = {
  businessName: "Makan Club",
  industry: "Food discovery app",
  description:
    "A Malaysian food app where you rank the places you've eaten, see where your friends go, and get personalised recommendations. Like Beli, built for Malaysia.",
  audience: "Malaysian foodies in their 20s in the Klang Valley who always ask 'where to eat?' and trust friends over ads",
  features: [
    "Rank every place you've eaten and build your food list",
    "See your friends' top spots",
    "Personalised picks near you",
  ],
  goal: "followers",
  voice: "playful",
  slideCount: 7,
  postType: "ranking",
  topic: "Best burger places in KL",
  website: "",
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

  const middle = value.slideCount - 2;
  const example = value.postType === "auto" ? "Top 5 burger spots in KL" : POST_TYPE_INFO[value.postType].example;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Business name">
          <Input value={value.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="Makan Club" maxLength={80} />
        </Field>
        <Field label="Industry">
          <Input value={value.industry} onChange={(e) => set("industry", e.target.value)} placeholder="Food discovery app" maxLength={80} />
        </Field>
      </div>

      <Field label="What does it do?">
        <Textarea
          rows={3}
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="One or two sentences about the business, app or idea"
          maxLength={500}
        />
      </Field>

      <Field label="Target audience" hint="who + what they struggle with">
        <Textarea
          rows={2}
          value={value.audience}
          onChange={(e) => set("audience", e.target.value)}
          placeholder="Foodies in KL who never know where to eat"
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

      <Field label="Website" hint="optional">
        <Input value={value.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="example.com" maxLength={120} />
      </Field>

      <div className="flex flex-col gap-4 border-t border-zinc-100 pt-4">
        <Field label="Type of post">
          <div className="grid grid-cols-3 gap-2">
            <PostTypeButton
              selected={value.postType === "auto"}
              onClick={() => set("postType", "auto")}
              emoji="🪄"
              label="AI picks"
            />
            {POST_TYPES.map((t) => (
              <PostTypeButton
                key={t}
                selected={value.postType === t}
                onClick={() => set("postType", t)}
                emoji={POST_TYPE_INFO[t].emoji}
                label={POST_TYPE_INFO[t].label}
              />
            ))}
          </div>
        </Field>

        <Field label="What's this post about?" hint="optional · the AI researches it live">
          <Input value={value.topic ?? ""} onChange={(e) => set("topic", e.target.value)} placeholder={`e.g. ${example}`} maxLength={200} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Slides">
            <Select value={value.slideCount} onChange={(e) => set("slideCount", Number(e.target.value))}>
              {Array.from({ length: MAX_SLIDES - MIN_SLIDES + 1 }, (_, i) => MIN_SLIDES + i).map((n) => (
                <option key={n} value={n}>
                  {n} slides
                </option>
              ))}
            </Select>
          </Field>
          <p className="self-end pb-2 text-xs text-zinc-500">
            1 cover + {middle} {value.postType === "ranking" ? (middle === 1 ? "pick" : "picks") : middle === 1 ? "content slide" : "content slides"} + 1 call to action
          </p>
        </div>

        <Field label="Goal">
          <Segmented value={value.goal} onChange={(v) => set("goal", v)} options={GOALS.map((g) => ({ value: g, label: g }))} />
        </Field>

        <Field label="Brand voice">
          <Segmented value={value.voice} onChange={(v) => set("voice", v)} options={VOICES.map((v) => ({ value: v, label: v }))} />
        </Field>
      </div>
    </div>
  );
}

function PostTypeButton({ selected, onClick, emoji, label }: { selected: boolean; onClick: () => void; emoji: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left text-xs leading-tight transition ${
        selected ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-700 hover:border-zinc-400"
      }`}
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}
