# Marketing Agent

Generate Instagram carousel posts (3–10 slides) for any business or idea. Describe the business, pick a style, and get ready-to-post 1080×1350 slide images plus a caption and hashtags, written to earn saves, shares and swipe-through.

## Setup

```bash
npm install
cp .env.example .env.local   # then paste your Anthropic API key into .env.local
npm run dev
```

Open http://localhost:3000. Run the unit tests with `npm test`.

### Optional: images from online

Two more keys in `.env.local` let the AI find images for slides that have no uploaded photo. Both are optional, and the app works without them.

| Key | Source | Used for |
|---|---|---|
| `PEXELS_API_KEY` | [Pexels](https://www.pexels.com/api/) (free) | Stock photos for slides about a general idea |
| `BRAVE_SEARCH_API_KEY` | [Brave Search API](https://brave.com/search/api/) (paid, with monthly free credit) | Web images of a specific named place or product |

With only the Pexels key, every slide uses stock photos. Web images are usually copyrighted: the studio shows where each one came from and the ZIP includes an `image-credits.txt`, so check you have the right to use an image before posting it.

## How it works

1. **Post type + topic**: pick a type (top list / ranking, tips, product showcase, myth vs fact, before/after, behind the scenes, offer/launch, or let the AI choose) and optionally say what the post is about ("Best burger places in KL"), with 3–10 slides.
2. **Research** (`research()` in `src/lib/content-engine.ts`): when there's a topic, Claude searches the web first so rankings use real places, prices and ratings instead of guesses. Photo labels tell it which places you want included.
3. **Content engine** (`src/lib/content-engine.ts`, `src/lib/prompts.ts`): one Claude call (Opus 5, structured JSON output, vision) writes 3 scored hooks, the slides (cover → content → CTA) with info chips, the caption and hashtags. It looks at your uploaded photos and puts each one on the right slide, and picks a color palette + template from the photos' colorway. A validator checks the carousel rules and runs one repair call if they're broken.
4. **Renderer** (`src/lib/render-slide.tsx`, `src/lib/templates.ts`): turns each slide into a 1080×1350 PNG with `next/og` (Satori). Layouts: full-bleed photo with overlay text, editorial photo card (Minimal), tilted phone mockup for app screenshots, polaroid collage cover, and text slides with a giant rank number and emoji sticker. Four templates: Bold, Gradient, Minimal, Dark.
5. **Images from online** (`src/lib/image-search.ts`, `src/lib/safe-fetch.ts`): the writer gives every slide an image search query and says whether it needs a stock photo or a web image. With "Let AI find images" switched on, generation fills each slide that has no uploaded photo with the top result; "Find images" in the slide editor shows alternatives to pick from. The server downloads the chosen image (https and public hosts only) and the browser resizes it like an upload.
6. **Ask AI to change anything** (`editPost()` in `src/lib/content-engine.ts`, `src/lib/post-edit.ts`): one instruction for the whole post, e.g. "make it darker and swap slide 3's photo". The model returns only what changes (slide text, emoji, chips, a slide's image, colors and template, caption, hashtags); everything else is left as it is, and the edit can be undone. It can't add, remove or reorder slides.
7. **Studio UI** (`src/components/`): form, photo uploader (resized in the browser), AI or manual colors, Instagram-style preview, whole-post AI edit, per-slide editor (text, chips, photo, image search, hook swap, AI rewrite), caption editor and ZIP download.

### API routes

| Route | Purpose |
|---|---|
| `POST /api/research` | Topic → web research notes |
| `POST /api/generate` | Business input + photos + notes → carousel plan (JSON) |
| `POST /api/suggest-palette` | Business + photos → colors and template |
| `POST /api/regenerate-slide` | Rewrite one slide, optionally with an instruction |
| `POST /api/edit-post` | Instruction + current post → the parts that change |
| `GET /api/find-images` | Which image sources have a key configured |
| `POST /api/find-images` | Search query → image candidates |
| `POST /api/import-image` | Image URL → image bytes (guarded download) |
| `POST /api/render` | One slide + brand + photo → PNG |

## Roadmap

- TikTok photo carousels (9:16) and short videos
- AI-generated images
- Weekly content calendar
- Direct publishing via Instagram Graph API / TikTok Content Posting API
- Accounts + saved brand profiles
