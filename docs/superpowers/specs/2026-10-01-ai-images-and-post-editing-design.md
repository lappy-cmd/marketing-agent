# AI-found images, more features, and whole-post AI editing

Date: 2026-10-01
Status: implemented

Differences from this spec in the implementation:

- Web results often don't report their size, so `filterCandidates` only applies the size and shape rules when the size is known.
- The model's edit output uses a `change` flag on palette, caption and hashtags (the fallback in 3.1); `normalizeEdit` in `post-edit.ts` turns that into the nullable `PostEdit`.
- The picker is its own component (`ImagePicker.tsx`), the auto-fill switch lives in `Studio.tsx` (`PhotoUploader.tsx` is unchanged), and shared output cleanup moved to `src/lib/clean.ts`.
- `@types/node` was bumped to 24 (the installed Node version), which Vitest 5 requires.

## Goal

Three changes to the Instagram carousel studio:

1. Let the user promote more than 3 features.
2. Let the AI find and import images from online for slides that have no uploaded photo, as an option the user switches on.
3. Let the AI change specific parts of a post from one instruction: slide text, emoji, chips, a slide's image, colors and template, caption, hashtags. Today it can only rewrite one slide's text.

## Decisions made with the user

- Image sources: stock photos (Pexels) for generic slides, open-web image search (Brave) for slides about a specific real place or product.
- Image flow: an auto-fill switch that runs during generation, plus a per-slide "Find images" picker.
- AI edit scope: one instruction box for the whole post that can change anything in it, leaving everything else untouched.

## Out of scope

- AI-generated images (needs a separate image model and key).
- Having the AI look at candidate images to rank them. Auto-fill takes the top filtered search result; the picker is the correction path.
- Adding, removing or reordering slides through an AI edit.
- Multi-level undo, and persisting plans across reloads.

---

## 1. More than 3 features

- `schemas.ts`: add `export const MAX_FEATURES = 8` and use it in `BusinessInputSchema.features` (`.max(MAX_FEATURES)`).
- `BusinessForm.tsx`: the "+ Add feature" button and the hint ("1–8") use `MAX_FEATURES`.
- `prompts.ts` (`taskText`): add one sentence: when more features are listed than fit the value slides, choose the ones that best serve this post's topic and goal rather than mentioning all of them.

## 2. AI-found images

### 2.1 Slide plan fields

`SlideSchema` gains two fields, filled by the writer model during generation (no extra model call):

- `imageQuery: string` — a search query for an image that fits this slide, or empty.
- `imageKind: "none" | "stock" | "web"`.

Prompt rules added to the Photos section of `SYSTEM_PROMPT`:

- `web`: the slide is about one named real place, dish or product. The query is its name plus location and what to show ("Burger On 16 Kuala Lumpur burger").
- `stock`: the slide is about a general idea. The query describes a concrete scene in 3-6 words ("friends sharing food at night market").
- `none`: slides that already have an uploaded photo, CTA slides for apps, and any slide where a photo would not help.
- Hook: `none` when at least two other slides will have images (it shows a collage of them); otherwise `stock`.

`regenerateSlide` preserves the existing `imageQuery` and `imageKind`, as it already does for `role` and `imageIndex`.

### 2.2 Server: search

New `src/lib/image-search.ts` (server-only).

```ts
type ImageCandidate = {
  url: string;        // full-size image
  thumbUrl: string;
  width: number;
  height: number;
  kind: "stock" | "web";
  sourceName: string; // "Pexels" or the page's domain
  author: string;     // photographer, or ""
  pageUrl: string;    // where the image came from
};

searchImages(query, kind): Promise<{ candidates: ImageCandidate[]; kindUsed: "stock" | "web" }>
imageSources(): { stock: boolean; web: boolean } // which keys are configured
filterCandidates(raw: ImageCandidate[]): ImageCandidate[] // pure
```

- Stock: Pexels `GET https://api.pexels.com/v1/search` with `orientation=portrait`, `per_page=15`, header `Authorization: <PEXELS_API_KEY>`. Full image from `src.large2x`, thumbnail from `src.medium`.
- Web: Brave `GET https://api.search.brave.com/res/v1/images/search` with `count=20`, `safesearch=strict`, header `X-Subscription-Token: <BRAVE_SEARCH_API_KEY>`. Exact response field names are confirmed against Brave's docs during implementation.
- `filterCandidates`: drop anything under 600 px on either side, with height/width outside 0.5–2.0, with a non-https URL, or with an `.svg`/`.gif` URL; de-duplicate by URL; return the first 6.
- Fallback: `kind: "web"` with no Brave key uses stock and reports `kindUsed: "stock"`. If the required key is missing and no fallback exists, throw an `ImageSearchError` with a message naming the env var.

Routes:

- `GET /api/find-images` → `{ stock: boolean, web: boolean }`.
- `POST /api/find-images` `{ query: string (1–200), kind: "stock" | "web" }` → `{ candidates, kindUsed }`.

`api-errors.ts` maps `ImageSearchError` to a JSON error (502, or 500 for a missing key).

### 2.3 Server: import

New `src/lib/safe-fetch.ts` (server-only) and `POST /api/import-image` `{ url }` → the image bytes.

The browser cannot draw a cross-origin image to a canvas, so the server downloads it. Because it fetches a caller-supplied URL, it is guarded:

- `https:` only.
- Resolve the hostname and reject loopback, private, link-local and other non-public addresses (`isPublicAddress(ip)`, pure, IPv4 and IPv6).
- Redirects handled manually, at most 3 hops, each hop re-checked.
- 10 s timeout; response `Content-Type` must be `image/jpeg`, `image/png` or `image/webp`; body capped at 10 MB while streaming.

Failures return a 4xx/502 JSON error; the client treats that as "try the next candidate".

### 2.4 Client: data model

`StudioPhoto` (`photos.ts`) gains:

```ts
origin: "upload" | "stock" | "web";
credit?: { sourceName: string; author: string; pageUrl: string };
slideIndex?: number; // found images only: the slide it was imported for
```

- `loadPhoto` is split so the downscale step also accepts a `Blob`; `importImage(candidate, slideIndex)` calls `/api/import-image` and returns a `StudioPhoto`.
- `Studio.tsx` keeps uploads in `photos` as now and adds `found: StudioPhoto[]`. A slide's `photoId` may point at either list. `found` is cleared on each new generation.
- Only uploads are sent to the model (`toPhotoInputs` is unchanged), and `MAX_PHOTOS` applies to uploads only.
- The hook collage draws from uploads and found images that slides use.

### 2.5 Client: flow

**Switch.** Under the uploader: "Let AI find images for slides without a photo". Its state is saved with the other preferences in localStorage, default off. On load the client calls `GET /api/find-images`; if neither source is configured the switch is disabled with a hint naming the keys, and if only stock is configured a note says web images will use stock.

**Auto-fill.** In `onGenerate`, when the switch is on:

1. The plan is shown as soon as it arrives (slides render without images).
2. Phase becomes `"finding"` ("Finding images…").
3. For each slide with no uploaded photo and `imageKind !== "none"`, at most 3 at a time: search, then import the first candidate; if the import fails, try the next, up to 3 candidates.
4. A slide that ends with no image is left as a text slide. One notice lists the slides that got none. Auto-fill never fails the generation.

Results from an earlier generation are discarded using a generation counter.

**Picker.** `SlideEditor.tsx`:

- The photo row shows uploads plus found images whose `slideIndex` is this slide; found images carry a small source badge. The row now shows even when there are no uploads, if any source is configured.
- "Find images" opens an inline panel: an editable query (pre-filled with `imageQuery`), a Stock / Web toggle (pre-set to `imageKind`, Web hidden if not configured), and up to 6 thumbnails each captioned with `sourceName`. Clicking one imports it and sets it on the slide.
- When stock results are shown, the panel shows a "Photos provided by Pexels" link (required by Pexels' API terms).
- Under the photo row, the selected found image shows its credit as a link to `pageUrl`.

**Credits in the export.** When any slide uses a found image, the ZIP includes `image-credits.txt` with one line per slide: slide number, source, author, page URL. A line above them reminds the user that web images may be copyrighted.

## 3. Whole-post AI editing

### 3.1 API

`POST /api/edit-post`:

```ts
{
  input: BusinessInput,
  plan: CarouselPlan,
  brand: { template, primaryColor, secondaryColor },
  uploads: string[],              // labels of uploaded photos, by index
  slideImages: { source: "none" | "upload" | "found"; label: string }[], // one per slide
  instruction: string             // 1–500 chars
}
```

Response `{ edit: PostEdit }`, where the model's structured output is:

```ts
PostEdit = {
  summary: string;                // one sentence: what was changed
  slides: {                       // only slides that change
    index: number;
    kicker: string; headline: string; body: string; emoji: string; chips: string[];
    image: {
      action: "keep" | "remove" | "upload" | "find";
      uploadIndex: number;        // for "upload", else -1
      query: string;              // for "find", else ""
      kind: "stock" | "web";
    };
  }[];
  palette: { primaryColor: string; secondaryColor: string; template: TemplateId } | null;
  caption: string | null;
  hashtags: string[] | null;
}
```

If the SDK's output format rejects nullable fields, `palette`, `caption` and `hashtags` become always-present values with a `changed: boolean` flag each; the client-side shape stays the same.

### 3.2 Prompt

`buildEditPostPrompt` gives the model the business description, every slide (role, kicker, headline, body, emoji, chips, current image), the current colors and template, caption, hashtags, the upload labels, and the instruction. Rules:

- Change only what the instruction asks for. List a slide only if something on it changes, and copy its untouched fields exactly.
- Set `palette`, `caption`, `hashtags` to null unless the instruction calls for changing them.
- Slide rules, color rules and caption rules from the system prompt still apply to anything rewritten.
- Slides cannot be added, removed or reordered; if asked, say so in `summary` and change nothing else.

The model sees image labels and queries, not the pixels, so it can swap or remove an image but cannot judge what one looks like.

### 3.3 Server handling

`editPost()` in `content-engine.ts`: one `callModel` call, then normalization: drop entries with an out-of-range or duplicate `index`; clean emoji and chips with the existing `cleanSlide` helpers; clean the palette with `cleanPalette`; normalize hashtags as `normalize` does; force `upload` actions with an invalid `uploadIndex` to `keep`. Slide `role` is never taken from the model.

### 3.4 Client

New pure module `src/lib/post-edit.ts`:

```ts
applyEdit(plan, brand, edit, uploads): {
  plan; brand;
  imageJobs: { index: number; query: string; kind: "stock" | "web" }[];
}
```

- Text fields are replaced on listed slides. `remove` clears `photoId`; `upload` sets it to that upload's id; `find` leaves the image as is and emits an image job (and updates the slide's `imageQuery`/`imageKind`).
- New component `EditWithAI.tsx` above the carousel preview: an input ("Ask AI to change… e.g. make it darker, swap slide 3's photo, shorten the caption") and a button.
- `Studio.tsx` `onEditPost`: snapshot `{ plan, brand, found, autoColors }`, call the API, apply the edit, run image jobs through the same search-and-import path as auto-fill (they run whether or not the auto-fill switch is on), bump `editorVersion`.
- A palette change turns off AI colors, as a manual color change does.
- After an edit, a line shows `summary` with an **Undo** button that restores the snapshot. The snapshot is replaced by the next edit and cleared by a new generation.
- The per-slide "Rewrite with AI" is unchanged.

## 4. Configuration and docs

- `.env.example`: add `PEXELS_API_KEY` and `BRAVE_SEARCH_API_KEY`, both optional, with where to get them.
- `README.md`: document the image option, the two keys, the new routes, the whole-post edit, and the copyright caveat for web images; remove "Optional stock photos" from the roadmap; fix the "3–5 slides" line while there.

## 5. Error handling summary

| Situation | Behaviour |
|---|---|
| No image keys set | Switch disabled with a hint; "Find images" hidden; generation unaffected |
| Only Pexels key | `web` slides use stock; picker hides the Web toggle |
| Search returns nothing or errors | Auto-fill: slide stays a text slide, listed in one notice. Picker: inline message |
| Image import blocked or fails | Auto-fill tries the next candidate (up to 3). Picker: inline message, panel stays open |
| Edit asks for something unsupported | `summary` explains; nothing else changes |
| Edit API fails | Error banner; post untouched; no undo snapshot kept |

## 6. Testing

The repo has no tests. Add Vitest as a dev dependency with an `npm test` script, and unit-test the pure logic:

- `applyEdit`: untouched slides are identical; each image action; null palette/caption/hashtags leave values alone; image jobs emitted.
- Edit normalization: out-of-range and duplicate indexes dropped; invalid upload index becomes `keep`.
- `filterCandidates`: size, aspect, scheme, extension, de-duplication, cap of 6.
- `isPublicAddress`: loopback, RFC 1918, link-local, IPv6 loopback/unique-local rejected; public addresses accepted.
- `BusinessInputSchema`: 8 features accepted, 9 rejected.

Then `npx tsc --noEmit`, `npm run lint`, `npm run build`, and a manual run in the browser covering: generation with the switch off (unchanged behaviour), with the switch on, the picker, a multi-part AI edit, undo, and the ZIP credits file. The live image and model calls need real keys, so those manual checks depend on the user's `.env.local`.

## 7. Files

New: `src/lib/image-search.ts`, `src/lib/safe-fetch.ts`, `src/lib/post-edit.ts`, `src/app/api/find-images/route.ts`, `src/app/api/import-image/route.ts`, `src/app/api/edit-post/route.ts`, `src/components/EditWithAI.tsx`, test files beside the modules they cover, `vitest.config.ts`.

Changed: `src/lib/schemas.ts`, `src/lib/prompts.ts`, `src/lib/content-engine.ts`, `src/lib/client-api.ts`, `src/lib/photos.ts`, `src/lib/api-errors.ts`, `src/components/Studio.tsx`, `src/components/SlideEditor.tsx`, `src/components/PhotoUploader.tsx`, `src/components/BusinessForm.tsx`, `README.md`, `.env.example`, `package.json`.

Per `AGENTS.md`, the Next.js docs in `node_modules/next/dist/docs/` are read before writing the route handlers, since this Next version differs from older conventions.
