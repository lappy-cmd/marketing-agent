import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CSSProperties, ReactNode } from "react";
import { ImageResponse } from "next/og";
import type { RenderImage, RenderRequest } from "./schemas";
import { buildTheme, fitFontSize, onPhotoTheme, SLIDE_HEIGHT, SLIDE_WIDTH, type Theme } from "./templates";

const fontDir = join(process.cwd(), "assets", "fonts");
const font = (file: string) => readFile(join(fontDir, file));

// Loaded once per server instance.
const fontsPromise = Promise.all([
  font("inter-500.ttf"),
  font("montserrat-800.ttf"),
  font("bricolage-grotesque-800.ttf"),
  font("poppins-700.ttf"),
  font("playfair-display-700.ttf"),
]).then(([inter500, montserrat800, bricolage800, poppins700, playfair700]) => [
  { name: "Inter", data: inter500, weight: 500 as const, style: "normal" as const },
  { name: "Montserrat", data: montserrat800, weight: 800 as const, style: "normal" as const },
  { name: "Bricolage Grotesque", data: bricolage800, weight: 800 as const, style: "normal" as const },
  { name: "Poppins", data: poppins700, weight: 700 as const, style: "normal" as const },
  { name: "Playfair Display", data: playfair700, weight: 700 as const, style: "normal" as const },
]);

const PAD = 80;
const CONTENT_WIDTH = SLIDE_WIDTH - PAD * 2;
// App screenshots are much taller than camera photos (~2:1 vs 4:3).
const SCREENSHOT_ASPECT = 1.6;
const SHADOW = "0 2px 16px rgba(0, 0, 0, 0.35)";
// Satori throws on style properties set to undefined, so add the shadow
// property only when it's wanted.
const textShadow = (on?: boolean): CSSProperties => (on ? { textShadow: SHADOW } : {});

// Straight apostrophes leave a visible gap in heavy weights; curly ones render
// correctly and are better typography anyway. (Fonts are chosen so Satori's
// measured and drawn widths match; many fonts leave gaps after kerned words.)
function fixText(text: string): string {
  return text.replace(/(\w)'(\w)/g, "$1’$2");
}

// Average glyph width as a fraction of font size, for headline auto-fit.
const HEADLINE_CHAR_WIDTH: Record<Theme["headlineFont"], number> = {
  Inter: 0.58,
  Montserrat: 0.66,
  "Bricolage Grotesque": 0.58,
  Poppins: 0.64,
  "Playfair Display": 0.52,
};

// ---------- Small pieces ----------

function Arrow({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Header({ req, theme, onPhoto }: { req: RenderRequest; theme: Theme; onPhoto?: boolean }) {
  const { brand, businessName, index, total } = req;
  const shadow = textShadow(onPhoto);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 72 }}>
      {brand.logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoDataUrl} height={64} style={{ maxWidth: 320, objectFit: "contain" }} alt="" />
      ) : (
        <div style={{ display: "flex", fontFamily: theme.headlineFont, fontWeight: theme.headlineWeight, fontSize: 30, color: theme.text, ...shadow }}>
          {fixText(businessName)}
        </div>
      )}
      <div
        style={{
          display: "flex",
          fontFamily: theme.bodyFont,
          fontWeight: 500,
          fontSize: 24,
          color: theme.text,
          background: theme.chipBg,
          borderRadius: 999,
          padding: "8px 20px",
        }}
      >
        {`${index + 1}/${total}`}
      </div>
    </div>
  );
}

function Footer({ req, theme, onPhoto }: { req: RenderRequest; theme: Theme; onPhoto?: boolean }) {
  const { brand, index, total } = req;
  const isLast = index === total - 1;
  const shadow = textShadow(onPhoto);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
      <div style={{ display: "flex", width: 280, fontFamily: theme.bodyFont, fontWeight: 500, fontSize: 26, color: theme.muted, ...shadow }}>
        {brand.handle ? `@${brand.handle.replace(/^@/, "")}` : ""}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            style={{
              width: i === index ? 34 : 11,
              height: 11,
              borderRadius: 6,
              background: i === index ? theme.accent : theme.muted,
              opacity: i === index ? 1 : 0.45,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", width: 280, justifyContent: "flex-end" }}>
        {isLast ? null : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: theme.bodyFont, fontWeight: 500, fontSize: 26, color: theme.text, ...shadow }}>
            Swipe
            <Arrow color={theme.text} size={32} />
          </div>
        )}
      </div>
    </div>
  );
}

function Headline({
  text,
  theme,
  max,
  maxHeight,
  width = CONTENT_WIDTH,
  shadow,
}: {
  text: string;
  theme: Theme;
  max: number;
  maxHeight: number;
  width?: number;
  shadow?: boolean;
}) {
  const size = fitFontSize(text, { width, maxHeight, max, min: 44, charWidth: HEADLINE_CHAR_WIDTH[theme.headlineFont] });
  return (
    <div
      style={{
        display: "flex",
        width,
        fontFamily: theme.headlineFont,
        fontWeight: theme.headlineWeight,
        fontSize: size,
        lineHeight: 1.06,
        letterSpacing: theme.headlineFont === "Playfair Display" ? 0 : -size * 0.025,
        color: theme.text,
        ...textShadow(shadow),
      }}
    >
      {fixText(text)}
    </div>
  );
}

function Body({ text, theme, size = 38, width = CONTENT_WIDTH, shadow }: { text: string; theme: Theme; size?: number; width?: number; shadow?: boolean }) {
  if (!text.trim()) return null;
  return (
    <div
      style={{
        display: "flex",
        width,
        fontFamily: theme.bodyFont,
        fontWeight: 500,
        fontSize: size,
        lineHeight: 1.36,
        color: theme.muted,
        marginTop: 26,
        ...textShadow(shadow),
      }}
    >
      {fixText(text)}
    </div>
  );
}

function Chips({ chips, theme, style }: { chips: string[]; theme: Theme; style?: CSSProperties }) {
  if (!chips.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 30, ...style }}>
      {chips.map((c, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            fontFamily: theme.bodyFont,
            fontWeight: 500,
            fontSize: 30,
            color: theme.text,
            background: theme.chipBg,
            borderRadius: 999,
            padding: "12px 26px",
          }}
        >
          {fixText(c)}
        </div>
      ))}
    </div>
  );
}

// Small tag above a hook headline.
function Tag({ text, theme, filled }: { text: string; theme: Theme; filled?: boolean }) {
  if (!text.trim()) return null;
  return (
    <div style={{ display: "flex", marginBottom: 26 }}>
      <div
        style={{
          display: "flex",
          fontFamily: theme.bodyFont,
          fontWeight: 500,
          fontSize: 28,
          letterSpacing: theme.uppercaseKicker ? 3 : 0,
          textTransform: theme.uppercaseKicker ? "uppercase" : "none",
          color: filled ? theme.accentText : theme.accent,
          background: filled ? theme.accent : "transparent",
          borderRadius: 999,
          padding: filled ? "10px 24px" : 0,
        }}
      >
        {text}
      </div>
    </div>
  );
}

// "#1", "01", "Myth #1"... Rank-style labels get a big filled badge.
function Label({ text, theme }: { text: string; theme: Theme }) {
  if (!text.trim()) return null;
  if (!isRank(text)) return <Tag text={text} theme={theme} filled />;
  return (
    <div style={{ display: "flex", marginBottom: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 124,
          height: 124,
          padding: "0 26px",
          borderRadius: 62,
          background: theme.accent,
          color: theme.accentText,
          fontFamily: theme.headlineFont,
          fontWeight: theme.headlineWeight,
          fontSize: 64,
          letterSpacing: -2,
        }}
      >
        {text.trim()}
      </div>
    </div>
  );
}

function CtaButton({ text, theme }: { text: string; theme: Theme }) {
  if (!text.trim()) return null;
  return (
    <div style={{ display: "flex", marginTop: 44 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          background: theme.accent,
          color: theme.accentText,
          fontFamily: theme.bodyFont,
          fontWeight: 500,
          fontSize: 34,
          padding: "24px 44px",
          borderRadius: 999,
        }}
      >
        {text}
        <Arrow color={theme.accentText} size={34} />
      </div>
    </div>
  );
}

// Soft color blobs so text-only slides don't look flat. (Absolute elements are
// positioned with left/top only: Satori misplaces right/bottom.)
function Glow({ theme }: { theme: Theme }) {
  const blob = (style: CSSProperties) => (
    <div
      style={{
        position: "absolute",
        width: 860,
        height: 860,
        borderRadius: 430,
        backgroundImage: `radial-gradient(circle at center, ${theme.glow} 0%, rgba(0,0,0,0) 70%)`,
        ...style,
      }}
    />
  );
  return (
    <>
      {blob({ top: -280, left: SLIDE_WIDTH - 860 + 280 })}
      {blob({ top: SLIDE_HEIGHT - 860 + 320, left: -300 })}
    </>
  );
}

const isRank = (kicker: string) => /^#?\d{1,2}$/.test(kicker.trim());

// Giant faded rank number filling the empty top of a text-only slide.
function Watermark({ text, theme }: { text: string; theme: Theme }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 90,
        left: PAD - 20,
        display: "flex",
        fontFamily: theme.headlineFont,
        fontWeight: theme.headlineWeight,
        fontSize: 560,
        lineHeight: 1,
        letterSpacing: -30,
        color: theme.text,
        opacity: 0.1,
      }}
    >
      {text.trim()}
    </div>
  );
}

// Emoji on a tilted disc, like a sticker slapped on the slide.
function Sticker({ emoji, theme, top = 190, right = PAD, size = 210 }: { emoji: string; theme: Theme; top?: number; right?: number; size?: number }) {
  if (!emoji) return null;
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: SLIDE_WIDTH - right - size,
        width: size,
        height: size,
        borderRadius: size / 2,
        background: theme.stickerBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.56,
        transform: "rotate(10deg)",
        boxShadow: "0 18px 40px rgba(0, 0, 0, 0.22)",
      }}
    >
      {emoji}
    </div>
  );
}

function Cover({ image, width, height, radius = 0 }: { image: RenderImage; width: number; height: number; radius?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image.src} width={width} height={height} style={{ width, height, objectFit: "cover", borderRadius: radius }} alt="" />
  );
}

// ---------- Slide text per role ----------

function TextBlock({
  req,
  theme,
  onPhoto,
  headlineMax,
  headlineHeight,
  width = CONTENT_WIDTH,
}: {
  req: RenderRequest;
  theme: Theme;
  onPhoto?: boolean;
  headlineMax: number;
  headlineHeight: number;
  width?: number;
}) {
  const { slide } = req;
  return (
    <div style={{ display: "flex", flexDirection: "column", width }}>
      {slide.role === "hook" ? <Tag text={slide.kicker} theme={theme} filled={onPhoto} /> : null}
      {slide.role === "value" ? <Label text={slide.kicker} theme={theme} /> : null}
      <Headline text={slide.headline} theme={theme} max={headlineMax} maxHeight={headlineHeight} width={width} shadow={onPhoto} />
      <Body text={slide.body} theme={theme} size={slide.role === "hook" ? 38 : 36} width={width} shadow={onPhoto} />
      <Chips chips={slide.chips} theme={theme} />
      {slide.role === "cta" ? <CtaButton text={slide.kicker} theme={theme} /> : null}
    </div>
  );
}

// ---------- Layouts ----------

function Frame({ theme, children, background }: { theme: Theme; children: ReactNode; background?: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: theme.background,
        overflow: "hidden",
      }}
    >
      {background}
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: PAD }}>{children}</div>
    </div>
  );
}

function TextOnlySlide({ req, theme }: { req: RenderRequest; theme: Theme }) {
  const hasSticker = !!req.slide.emoji;
  const hook = req.slide.role === "hook";
  return (
    <Frame
      theme={theme}
      background={
        <>
          <Glow theme={theme} />
          {req.slide.role === "value" && isRank(req.slide.kicker) ? <Watermark text={req.slide.kicker} theme={theme} /> : null}
          <Sticker emoji={req.slide.emoji} theme={theme} />
        </>
      }
    >
      <Header req={req} theme={theme} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", flexGrow: 1, paddingBottom: 36 }}>
        <TextBlock
          req={req}
          theme={theme}
          headlineMax={hook ? 132 : 100}
          headlineHeight={hasSticker ? (hook ? 520 : 400) : hook ? 640 : 480}
        />
      </div>
      <Footer req={req} theme={theme} />
    </Frame>
  );
}

function FullBleedSlide({ req, theme, image }: { req: RenderRequest; theme: Theme; image: RenderImage }) {
  const t = onPhotoTheme(theme);
  const hook = req.slide.role === "hook";
  return (
    <Frame
      theme={t}
      background={
        <>
          <div style={{ position: "absolute", top: 0, left: 0, display: "flex" }}>
            <Cover image={image} width={SLIDE_WIDTH} height={SLIDE_HEIGHT} />
          </div>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: SLIDE_WIDTH,
              height: SLIDE_HEIGHT,
              backgroundImage:
                "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 36%, rgba(0,0,0,0.72) 64%, rgba(0,0,0,0.9) 100%)",
            }}
          />
        </>
      }
    >
      <Header req={req} theme={t} onPhoto />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", flexGrow: 1, paddingBottom: 30 }}>
        <TextBlock req={req} theme={t} onPhoto headlineMax={hook ? 120 : 92} headlineHeight={hook ? 420 : 300} />
      </div>
      <Footer req={req} theme={t} onPhoto />
    </Frame>
  );
}

function PhotoCardSlide({ req, theme, image }: { req: RenderRequest; theme: Theme; image: RenderImage }) {
  const hook = req.slide.role === "hook";
  // Leave room below the card for label, headline, body and chips.
  const cardHeight = hook ? 580 : 470;
  return (
    <Frame theme={theme}>
      <Header req={req} theme={theme} />
      <div style={{ display: "flex", marginTop: 28, borderRadius: 40, boxShadow: "0 24px 50px rgba(0,0,0,0.16)" }}>
        <Cover image={image} width={CONTENT_WIDTH} height={cardHeight} radius={40} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, paddingTop: 30, paddingBottom: 20 }}>
        <TextBlock req={req} theme={theme} headlineMax={hook ? 92 : 76} headlineHeight={hook ? 250 : 170} />
      </div>
      <Footer req={req} theme={theme} />
    </Frame>
  );
}

// App screenshot in a phone frame, tilted on the right; text on the left.
function PhoneSlide({ req, theme, image }: { req: RenderRequest; theme: Theme; image: RenderImage }) {
  const phoneWidth = 420;
  const screenWidth = phoneWidth - 32;
  const screenHeight = Math.round(screenWidth * Math.min(image.aspect, 2.17));
  const textWidth = 470;
  return (
    <Frame
      theme={theme}
      background={
        <>
          <Glow theme={theme} />
          <div
            style={{
              position: "absolute",
              top: 300,
              left: SLIDE_WIDTH - 70 - phoneWidth,
              width: phoneWidth,
              display: "flex",
              padding: 16,
              background: "#0B0B0D",
              border: "2px solid rgba(255, 255, 255, 0.18)",
              borderRadius: 66,
              transform: "rotate(7deg)",
              boxShadow: "0 40px 80px rgba(0, 0, 0, 0.35)",
            }}
          >
            <Cover image={image} width={screenWidth} height={screenHeight} radius={52} />
          </div>
        </>
      }
    >
      <Header req={req} theme={theme} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1 }}>
        <TextBlock req={req} theme={theme} headlineMax={req.slide.role === "hook" ? 100 : 84} headlineHeight={440} width={textWidth} />
      </div>
      <Footer req={req} theme={theme} />
    </Frame>
  );
}

// Hook with no photo of its own: fan out the post's other photos as polaroids.
function CollageSlide({ req, theme, photos }: { req: RenderRequest; theme: Theme; photos: RenderImage[] }) {
  const spots = [
    { left: 60, top: 190, rotate: -8 },
    { left: 350, top: 150, rotate: 3 },
    { left: 636, top: 200, rotate: 10 },
  ].slice(0, photos.length);
  return (
    <Frame
      theme={theme}
      background={
        <>
          <Glow theme={theme} />
          {spots.map((s, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: s.left,
                top: s.top,
                display: "flex",
                padding: 14,
                paddingBottom: 46,
                background: "#FFFFFF",
                borderRadius: 18,
                transform: `rotate(${s.rotate}deg)`,
                boxShadow: "0 24px 50px rgba(0, 0, 0, 0.28)",
              }}
            >
              <Cover image={photos[i]} width={360} height={420} radius={8} />
            </div>
          ))}
          <Sticker emoji={req.slide.emoji} theme={theme} top={560} right={60} size={170} />
        </>
      }
    >
      <Header req={req} theme={theme} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", flexGrow: 1, paddingBottom: 30 }}>
        <TextBlock req={req} theme={theme} headlineMax={112} headlineHeight={330} />
      </div>
      <Footer req={req} theme={theme} />
    </Frame>
  );
}

function SlideLayout({ req, theme }: { req: RenderRequest; theme: Theme }) {
  const { image, collage, slide } = req;
  if (image && image.aspect >= SCREENSHOT_ASPECT) return <PhoneSlide req={req} theme={theme} image={image} />;
  if (image) {
    return theme.photoStyle === "card" ? (
      <PhotoCardSlide req={req} theme={theme} image={image} />
    ) : (
      <FullBleedSlide req={req} theme={theme} image={image} />
    );
  }
  if (slide.role === "hook" && collage && collage.length >= 2) {
    return <CollageSlide req={req} theme={theme} photos={collage} />;
  }
  return <TextOnlySlide req={req} theme={theme} />;
}

export async function renderSlide(req: RenderRequest): Promise<ImageResponse> {
  const theme = buildTheme(req.brand);
  return new ImageResponse(<SlideLayout req={req} theme={theme} />, {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    fonts: await fontsPromise,
    headers: { "Cache-Control": "no-store" },
  });
}
