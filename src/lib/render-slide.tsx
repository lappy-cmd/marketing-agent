import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { RenderRequest } from "./schemas";
import { buildTheme, fitFontSize, SLIDE_HEIGHT, SLIDE_WIDTH, type Theme } from "./templates";

const fontDir = join(process.cwd(), "assets", "fonts");
const font = (file: string) => readFile(join(fontDir, file));

// Loaded once per server instance.
const fontsPromise = Promise.all([
  font("inter-500.ttf"),
  font("playfair-display-700.ttf"),
  font("space-grotesk-500.ttf"),
  font("space-grotesk-700.ttf"),
  font("montserrat-800.ttf"),
]).then(([inter500, playfair700, grotesk500, grotesk700, montserrat800]) => [
  { name: "Inter", data: inter500, weight: 500 as const, style: "normal" as const },
  { name: "Playfair Display", data: playfair700, weight: 700 as const, style: "normal" as const },
  { name: "Space Grotesk", data: grotesk500, weight: 500 as const, style: "normal" as const },
  { name: "Space Grotesk", data: grotesk700, weight: 700 as const, style: "normal" as const },
  { name: "Montserrat", data: montserrat800, weight: 800 as const, style: "normal" as const },
]);

const PAD = 88;

const ZWNJ = String.fromCharCode(0x200c);

// Clean up text for Satori:
// - Straight apostrophes leave a visible gap in heavy weights; curly ones
//   render correctly and are better typography anyway.
// - Satori mis-measures Space Grotesk's ligatures (ff, tt, fi, ...), leaving a
//   gap after the word. A zero-width non-joiner after f/t prevents them.
function fixText(text: string, font: string): string {
  let out = text.replace(/(\w)'(\w)/g, "$1\u2019$2");
  if (font === "Space Grotesk") out = out.replace(/([ft])(?=[fitl])/g, `$1${ZWNJ}`);
  return out;
}

const CONTENT_WIDTH = SLIDE_WIDTH - PAD * 2;

// Average glyph width as a fraction of font size, for headline auto-fit.
const HEADLINE_CHAR_WIDTH: Record<Theme["headlineFont"], number> = {
  Inter: 0.58,
  Montserrat: 0.66,
  "Playfair Display": 0.52,
  "Space Grotesk": 0.58,
};

function Arrow({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Header({ req, theme }: { req: RenderRequest; theme: Theme }) {
  const { brand, businessName, index, total } = req;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 72 }}>
      {brand.logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoDataUrl} height={72} style={{ maxWidth: 360, objectFit: "contain" }} alt="" />
      ) : (
        <div style={{ fontFamily: theme.headlineFont, fontWeight: theme.headlineWeight, fontSize: 32, color: theme.text }}>
          {fixText(businessName, theme.headlineFont)}
        </div>
      )}
      <div
        style={{
          display: "flex",
          fontFamily: theme.bodyFont,
          fontWeight: 500,
          fontSize: 26,
          color: theme.muted,
          border: `2px solid ${theme.muted}`,
          borderRadius: 999,
          padding: "6px 20px",
        }}
      >
        {`${index + 1}/${total}`}
      </div>
    </div>
  );
}

function Footer({ req, theme }: { req: RenderRequest; theme: Theme }) {
  const { brand, index, total } = req;
  const isLast = index === total - 1;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
      <div style={{ display: "flex", fontFamily: theme.bodyFont, fontWeight: 500, fontSize: 28, color: theme.muted }}>
        {brand.handle ? `@${brand.handle.replace(/^@/, "")}` : ""}
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            style={{
              width: i === index ? 36 : 12,
              height: 12,
              borderRadius: 6,
              background: i === index ? theme.accent : theme.muted,
              opacity: i === index ? 1 : 0.45,
            }}
          />
        ))}
      </div>
      {isLast ? (
        <div style={{ width: 150 }} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: theme.bodyFont, fontWeight: 500, fontSize: 28, color: theme.text }}>
          Swipe
          <Arrow color={theme.text} size={34} />
        </div>
      )}
    </div>
  );
}

function Emoji({ emoji, size }: { emoji: string; size: number }) {
  if (!emoji.trim()) return null;
  return <div style={{ display: "flex", fontSize: size, marginBottom: 28 }}>{emoji.trim()}</div>;
}

function Body({ text, theme, size }: { text: string; theme: Theme; size: number }) {
  if (!text.trim()) return null;
  return (
    <div style={{ display: "flex", fontFamily: theme.bodyFont, fontWeight: 500, fontSize: size, lineHeight: 1.38, color: theme.muted, marginTop: 36 }}>
      {fixText(text, theme.bodyFont)}
    </div>
  );
}

function Headline({ text, theme, max, maxHeight }: { text: string; theme: Theme; max: number; maxHeight: number }) {
  const size = fitFontSize(text, {
    width: CONTENT_WIDTH,
    maxHeight,
    max,
    min: 44,
    charWidth: HEADLINE_CHAR_WIDTH[theme.headlineFont],
  });
  return (
    <div
      style={{
        display: "flex",
        fontFamily: theme.headlineFont,
        fontWeight: theme.headlineWeight,
        fontSize: size,
        lineHeight: 1.08,
        letterSpacing: theme.headlineFont === "Playfair Display" ? 0 : -size * 0.03,
        color: theme.text,
      }}
    >
      {fixText(text, theme.headlineFont)}
    </div>
  );
}

function Kicker({ text, theme }: { text: string; theme: Theme }) {
  if (!text.trim()) return null;
  return (
    <div
      style={{
        display: "flex",
        fontFamily: theme.bodyFont,
        fontWeight: 500,
        fontSize: 30,
        letterSpacing: theme.uppercaseKicker ? 3 : 0,
        textTransform: theme.uppercaseKicker ? "uppercase" : "none",
        color: theme.accent,
        marginBottom: 28,
      }}
    >
      {text}
    </div>
  );
}

function SlideContent({ req, theme }: { req: RenderRequest; theme: Theme }) {
  const { slide } = req;

  if (slide.role === "hook") {
    return (
      <div style={{ display: "flex", flexDirection: "column", width: CONTENT_WIDTH }}>
        <Emoji emoji={slide.emoji} size={120} />
        <Kicker text={slide.kicker} theme={theme} />
        <Headline text={slide.headline} theme={theme} max={136} maxHeight={640} />
        <Body text={slide.body} theme={theme} size={40} />
      </div>
    );
  }

  if (slide.role === "value") {
    return (
      <div style={{ display: "flex", flexDirection: "column", width: CONTENT_WIDTH }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 36 }}>
          <div
            style={{
              display: "flex",
              fontFamily: theme.headlineFont,
              fontWeight: theme.headlineWeight,
              fontSize: 76,
              color: theme.accent,
            }}
          >
            {slide.kicker}
          </div>
          {slide.emoji.trim() ? <div style={{ display: "flex", fontSize: 88 }}>{slide.emoji.trim()}</div> : null}
        </div>
        <Headline text={slide.headline} theme={theme} max={96} maxHeight={430} />
        <Body text={slide.body} theme={theme} size={42} />
      </div>
    );
  }

  // cta
  return (
    <div style={{ display: "flex", flexDirection: "column", width: CONTENT_WIDTH }}>
      <Emoji emoji={slide.emoji} size={110} />
      <Headline text={slide.headline} theme={theme} max={112} maxHeight={480} />
      <Body text={slide.body} theme={theme} size={40} />
      {slide.kicker.trim() ? (
        <div style={{ display: "flex", marginTop: 56 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              background: theme.accent,
              color: theme.accentText,
              fontFamily: theme.bodyFont,
              fontWeight: 500,
              fontSize: 36,
              padding: "26px 48px",
              borderRadius: 999,
            }}
          >
            {slide.kicker}
            <Arrow color={theme.accentText} size={36} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export async function renderSlide(req: RenderRequest): Promise<ImageResponse> {
  const theme = buildTheme(req.brand);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: theme.background,
          padding: PAD,
        }}
      >
        <Header req={req} theme={theme} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1 }}>
          <SlideContent req={req} theme={theme} />
        </div>
        <Footer req={req} theme={theme} />
      </div>
    ),
    {
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
      fonts: await fontsPromise,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
