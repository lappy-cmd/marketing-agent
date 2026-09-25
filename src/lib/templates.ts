import type { Brand, TemplateId } from "./schemas";

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350; // 4:5 — the tallest ratio Instagram shows in-feed

export type FontFamily = "Inter" | "Montserrat" | "Bricolage Grotesque" | "Poppins" | "Playfair Display";

export interface Theme {
  background: string; // any CSS background (solid or gradient)
  text: string;
  muted: string;
  accent: string;
  accentText: string; // text drawn on top of the accent color
  headlineFont: FontFamily;
  headlineWeight: number;
  bodyFont: FontFamily;
  uppercaseKicker: boolean;
  // How photos sit on the slide: edge-to-edge under a dark scrim, or as a
  // rounded card with text below (editorial look).
  photoStyle: "fullbleed" | "card";
  glow: string; // soft color blobs behind text-only slides
  chipBg: string;
  stickerBg: string; // disc behind the emoji sticker
}

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  bold: "Bold",
  gradient: "Gradient",
  minimal: "Minimal",
  dark: "Dark",
};

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return "#" + [c(ar, br), c(ag, bg), c(ab, bb)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

const INK = "#111111";
const PAPER = "#FFFFFF";

// Black or white, whichever reads better on `bg`.
function readableOn(bg: string): string {
  return contrast(bg, INK) >= contrast(bg, PAPER) ? INK : PAPER;
}

// Use `accent` on `bg` only if it's legible; otherwise fall back to the text color.
function legibleAccent(accent: string, bg: string, fallback: string): string {
  return contrast(accent, bg) >= 2.2 ? accent : fallback;
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function buildTheme(brand: Brand): Theme {
  const { primaryColor: primary, secondaryColor: secondary } = brand;

  switch (brand.template) {
    case "bold": {
      const text = readableOn(primary);
      const accent = legibleAccent(secondary, primary, text);
      return {
        background: primary,
        text,
        muted: withAlpha(text, 0.75),
        accent,
        accentText: readableOn(accent),
        headlineFont: "Montserrat",
        headlineWeight: 800,
        bodyFont: "Inter",
        uppercaseKicker: true,
        photoStyle: "fullbleed",
        glow: withAlpha(accent, 0.35),
        chipBg: withAlpha(text, 0.14),
        stickerBg: withAlpha(PAPER, 0.92),
      };
    }
    case "gradient": {
      // Text sits on both ends of the gradient, so pick the color that reads
      // best against the worse end, then tint both ends until it's legible.
      const minContrast = (c: string, a: string, b: string) => Math.min(contrast(c, a), contrast(c, b));
      const text = minContrast(PAPER, primary, secondary) >= minContrast(INK, primary, secondary) ? PAPER : INK;
      let [from, to] = [primary, secondary];
      for (let t = 0.1; minContrast(text, from, to) < 4 && t <= 0.8; t += 0.1) {
        const toward = text === PAPER ? "#000000" : "#FFFFFF";
        [from, to] = [mix(primary, toward, t), mix(secondary, toward, t)];
      }
      return {
        background: `linear-gradient(145deg, ${from} 0%, ${to} 100%)`,
        text,
        muted: withAlpha(text, 0.82),
        accent: text,
        accentText: readableOn(text),
        headlineFont: "Bricolage Grotesque",
        headlineWeight: 800,
        bodyFont: "Inter",
        uppercaseKicker: true,
        photoStyle: "fullbleed",
        glow: withAlpha(text, 0.16),
        chipBg: withAlpha(text, 0.16),
        stickerBg: withAlpha(PAPER, 0.92),
      };
    }
    case "minimal": {
      const bg = "#FAF7F2";
      const accent = legibleAccent(primary, bg, INK);
      return {
        background: bg,
        text: INK,
        muted: "#555049",
        accent,
        accentText: readableOn(accent),
        headlineFont: "Playfair Display",
        headlineWeight: 700,
        bodyFont: "Inter",
        uppercaseKicker: false,
        photoStyle: "card",
        glow: withAlpha(primary, 0.14),
        chipBg: withAlpha(accent, 0.1),
        stickerBg: PAPER,
      };
    }
    case "dark": {
      const bg = "#0C0C10";
      const accent = legibleAccent(primary, bg, legibleAccent(secondary, bg, PAPER));
      return {
        background: bg,
        text: PAPER,
        muted: "#B4B4BE",
        accent,
        accentText: readableOn(accent),
        headlineFont: "Poppins",
        headlineWeight: 700,
        bodyFont: "Inter",
        uppercaseKicker: true,
        photoStyle: "fullbleed",
        glow: withAlpha(accent, 0.3),
        chipBg: withAlpha(PAPER, 0.1),
        stickerBg: withAlpha(PAPER, 0.95),
      };
    }
  }
}

// Text drawn over a photo sits on a dark scrim, so it's always light; keep the
// brand accent only if it stays legible there.
export function onPhotoTheme(theme: Theme): Theme {
  const scrim = "#141414";
  const accent = legibleAccent(theme.accent, scrim, PAPER);
  return {
    ...theme,
    text: PAPER,
    muted: "rgba(255, 255, 255, 0.86)",
    accent,
    accentText: readableOn(accent),
    chipBg: "rgba(255, 255, 255, 0.18)",
  };
}

// Pick the largest font size (<= max) at which `text` fits in a box of
// `width` x `maxHeight`. Satori has no auto-fit, so estimate line wrapping from
// average glyph width.
export function fitFontSize(
  text: string,
  { width, maxHeight, max, min, lineHeight = 1.08, charWidth = 0.56 }: {
    width: number;
    maxHeight: number;
    max: number;
    min: number;
    lineHeight?: number;
    charWidth?: number;
  },
): number {
  const words = text.trim().split(/\s+/);
  for (let size = max; size > min; size -= 2) {
    const perLine = width / (size * charWidth);
    let lines = 1;
    let used = 0;
    for (const w of words) {
      const len = w.length + (used > 0 ? 1 : 0);
      if (used + len > perLine && used > 0) {
        lines++;
        used = w.length;
      } else {
        used += len;
      }
    }
    if (lines * size * lineHeight <= maxHeight) return size;
  }
  return min;
}
