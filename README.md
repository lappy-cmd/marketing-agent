# Marketing Agent

Generate Instagram carousel posts (3–5 slides) for any business or idea. Describe the business, pick a style, and get ready-to-post 1080×1350 slide images plus a caption and hashtags, written to earn saves, shares and swipe-through.

## Setup

```bash
npm install
cp .env.example .env.local   # then paste your Anthropic API key into .env.local
npm run dev
```

Open http://localhost:3000.

## How it works

1. **Content engine** (`src/lib/content-engine.ts`, `src/lib/prompts.ts`): a single Claude call (Opus 5, structured JSON output) writes 3 scored hook options, the slides (hook → value → CTA), a caption and hashtags. A validator checks the carousel rules (word limits, slide order, hashtag count) and runs one repair call if they're broken.
2. **Renderer** (`src/lib/render-slide.tsx`, `src/lib/templates.ts`): turns each slide into a PNG on the server with `next/og` (Satori). There are 4 templates (Bold, Gradient, Minimal, Dark), and each one takes its colors from your brand colors with contrast checks. Headline size adjusts to fit the text.
3. **Studio UI** (`src/components/`): form, brand panel, Instagram-style preview, per-slide editor (edit text, swap hooks, rewrite a slide with AI), caption editor and ZIP download.

### API routes

| Route | Purpose |
|---|---|
| `POST /api/generate` | Business input → carousel plan (JSON) |
| `POST /api/regenerate-slide` | Rewrite one slide, optionally with an instruction |
| `POST /api/render` | One slide + brand → PNG |

## Roadmap

- TikTok photo carousels (9:16) and short videos
- AI / stock background images
- Weekly content calendar
- Direct publishing via Instagram Graph API / TikTok Content Posting API
- Accounts + saved brand profiles
