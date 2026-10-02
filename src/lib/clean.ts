// Pure cleanup of model output, shared by the content engine and AI edits.
import { HEX, type Palette } from "./schemas";

// The model occasionally returns an emoji as escaped text ("🕒")
// instead of the character. Decode that, and drop anything that still isn't a
// pictograph so letters never end up rendered where the emoji goes.
export function cleanEmoji(raw: string): string {
  const decoded = raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
  return /^\p{Extended_Pictographic}/u.test(decoded) && !/[A-Za-z0-9\\]/.test(decoded) ? decoded : "";
}

export const cleanChips = (chips: string[]) => chips.map((c) => c.trim()).filter(Boolean).slice(0, 3);

export const cleanHashtags = (tags: string[]) =>
  tags.map((h) => "#" + h.replace(/^#+/, "").replace(/\s+/g, "")).filter((h) => h.length > 1);

type Colors = Pick<Palette, "primaryColor" | "secondaryColor">;

export const DEFAULT_PALETTE: Palette = {
  primaryColor: "#1F3D2B",
  secondaryColor: "#F2B84B",
  template: "bold",
  reason: "",
};

// Invalid hex values fall back to `fallback` (the current colors for an edit).
export function cleanPalette<P extends Colors>(p: P, fallback: Colors = DEFAULT_PALETTE): P {
  const pick = (c: string, or: string) => (HEX.test(c.trim()) ? c.trim().toUpperCase() : or);
  return {
    ...p,
    primaryColor: pick(p.primaryColor, fallback.primaryColor),
    secondaryColor: pick(p.secondaryColor, fallback.secondaryColor),
  };
}
