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

1. **Post type + topic**: pick a type (top list / ranking, tips, product showcase, myth vs fact, before/after, behind the scenes, offer/launch, or let the AI choose) and optionally say what the post is about ("Best burger places in KL"), with 3–10 slides.
2. **Research** (`research()` in `src/lib/content-engine.ts`): when there's a topic, Claude searches the web first so rankings use real places, prices and ratings instead of guesses. Photo labels tell it which places you want included.
3. **Content engine** (`src/lib/content-engine.ts`, `src/lib/prompts.ts`): one Claude call (Opus 5, structured JSON output, vision) writes 3 scored hooks, the slides (cover → content → CTA) with info chips, the caption and hashtags. It looks at your uploaded photos and puts each one on the right slide, and picks a color palette + template from the photos' colorway. A validator checks the carousel rules and runs one repair call if they're broken.
4. **Renderer** (`src/lib/render-slide.tsx`, `src/lib/templates.ts`): turns each slide into a 1080×1350 PNG with `next/og` (Satori). Layouts: full-bleed photo with overlay text, editorial photo card (Minimal), tilted phone mockup for app screenshots, polaroid collage cover, and text slides with a giant rank number and emoji sticker. Four templates: Bold, Gradient, Minimal, Dark.
5. **Studio UI** (`src/components/`): form, photo uploader (resized in the browser), AI or manual colors, Instagram-style preview, per-slide editor (text, chips, photo, hook swap, AI rewrite), caption editor and ZIP download.

### API routes

| Route | Purpose |
|---|---|
| `POST /api/research` | Topic → web research notes |
| `POST /api/generate` | Business input + photos + notes → carousel plan (JSON) |
| `POST /api/suggest-palette` | Business + photos → colors and template |
| `POST /api/regenerate-slide` | Rewrite one slide, optionally with an instruction |
| `POST /api/render` | One slide + brand + photo → PNG |

## Roadmap

- TikTok photo carousels (9:16) and short videos
- Optional stock photos for slides without an uploaded photo
- Weekly content calendar
- Direct publishing via Instagram Graph API / TikTok Content Posting API
- Accounts + saved brand profiles
