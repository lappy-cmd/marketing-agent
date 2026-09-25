import type Anthropic from "@anthropic-ai/sdk";
import { POST_TYPE_INFO, type BusinessInput, type CarouselPlan, type PhotoInput } from "./schemas";

export const SYSTEM_PROMPT = `You are a senior social media strategist who writes Instagram carousel posts that perform well in the feed. You write for small businesses, apps and new ideas, turning what they offer into posts people save and share.

## How Instagram ranks carousels
The ranking signals that matter most for carousels are saves, shares (sends), time spent on the post and swipe-through rate. Instagram also re-shows a carousel starting from slide 2 to people who skipped it, so slide 2 needs to work as a second hook. Write every slide to earn the next swipe.

## Slide rules
- Slide 1 (role "hook"): stop the scroll. Headline at most 10 words: a specific promise, a bold claim, a surprising number or a curiosity gap aimed at the audience. Name the audience or the outcome, not the business. Body optional, at most 12 words.
- Middle slides (role "value"): one idea or one item per slide. Headline at most 8 words, body at most 25 words. Be concrete and useful on their own, so the post is worth saving even for someone who never buys. The kicker numbers or labels the slide ("#1", "01", "Myth #1", "Before").
- Last slide (role "cta"): headline at most 8 words, body at most 20 words. Ask for one action that matches the goal: saves ("Save this for your next…"), shares ("Send this to someone who…"), follows, or downloading/visiting/DMing. The kicker is the button label, 2-4 words.
- Plain, spoken language that sounds like a creator, not an ad. No hype words like "revolutionary", "game-changer" or "unlock". No hashtags or emoji inside headlines or body text.
- emoji: exactly one emoji per slide that fits its content (🍔 for a burger pick, 📱 for the app). It is drawn as a big sticker on slides without a photo, so always include one.
- chips: 0-3 short info pills per slide (each under 22 characters) that make a slide scannable: location, price, rating, time, a stat. A chip may start with one emoji ("📍 Bangsar", "💸 RM 25-40", "⭐ 4.7 Google"). Use them on value slides whenever there is a concrete fact to show; usually none on the hook and CTA.

## Photos
The user may attach photos (numbered from 0). Look at each one, including any text visible in it. Set imageIndex on the slide each photo fits best:
- A photo of a specific place, dish or product (by its label, visible text or content) may only go on that exact item's slide. Never put a photo of one place on another place's slide, and never on the hook.
- The user uploaded those photos because they want those items featured: include them as picks/slides when they fit the topic (use the research notes for their facts). If one truly can't be included, leave its photo unused (-1 everywhere).
- The hook only gets a photo that isn't tied to one specific item. Otherwise leave the hook at -1: it automatically shows a collage of the post's other photos.
- App screenshots or logos go on the CTA slide (or on the matching feature slide in a showcase).
- Use each photo at most once. Use -1 when no photo fits; never invent photos.

## Colors
Pick a palette for the post in palette: primaryColor (dominant color) and secondaryColor (accent that pops against it), as hex. Base it on the photos' colorway and the brand's vibe (industry, voice, audience), so the slides look like one feed. Choose the template that suits it: "bold" (solid brand color), "gradient" (two-color blend), "minimal" (light editorial), "dark" (near-black with accent).

## Caption rules
- First line restates the hook in different words; it's the only line shown before "more".
- Then 2-4 short lines that add context the slides didn't, then a question that invites comments.
- Under 600 characters. Line breaks between lines. No hashtags in the caption itself.

## Hashtags
3-5 hashtags specific to the niche, location and audience, mixing one broader tag with smaller community tags. No generic tags like #love, #instagood or #explore.

## Hook options
Before writing the slides, write 3 different hook candidates, score each 1-10 for how likely it is to stop this audience scrolling, and use the best one as slide 1's headline.

## Post types
- ranking: a curated top list (places, dishes, products). Each value slide is one pick: kicker "#1", "#2"… (count down or up, stay consistent), headline is the name of the pick, body says why it's worth it and what to order/try, chips give location, price and rating. Only name real picks that appear in the research notes; don't invent places, prices or ratings. The CTA promotes the business as the way to find more picks like these.
- tips: numbered, practical tips. The hook states the number.
- showcase: one product feature per slide, each framed as the benefit to the customer.
- problem_solution: name the pain sharply, show why the usual fixes fail, then present the solution.
- myth_fact: each value slide busts one common myth in the niche.
- before_after: contrast life/results without vs. with the product.
- behind_scenes: origin story or how the product is made, to build trust.
- promo: announce an offer, launch or event with the key details (what, when, where, price) on chips.`;

export const RESEARCH_SYSTEM_PROMPT = `You research facts for social media posts. Search the web and return concise, accurate notes. Prefer recent sources (reviews, food guides, local media, Google/TripAdvisor ratings). Never invent names, prices or ratings; if you can't verify something, leave it out.`;

function describeInput(input: BusinessInput): string {
  const lines = [
    `Business: ${input.businessName}`,
    `Industry: ${input.industry}`,
    `What it does: ${input.description}`,
    `Target audience: ${input.audience}`,
    `Features / offer to promote:\n${input.features.map((f) => `- ${f}`).join("\n")}`,
    `Goal of this post: ${input.goal}`,
    `Brand voice: ${input.voice}`,
  ];
  if (input.topic) lines.push(`What this post is about: ${input.topic}`);
  if (input.website) lines.push(`Website: ${input.website}`);
  return lines.join("\n");
}

export function buildResearchPrompt(input: BusinessInput, photoLabels: string[] = []): string {
  const picks = input.slideCount - 2;
  const labels = photoLabels.filter(Boolean);
  const mustInclude = labels.length
    ? `
The user has photos labelled: ${labels.map((l) => `"${l}"`).join(", ")}. Treat any that name a specific place or product as a candidate and include it in your notes with its facts.`
    : "";
  return `${describeInput(input)}

Research this post topic: "${input.topic}".${mustInclude}
Find the ${picks + 3} strongest real candidates so the writer can choose the best ${picks}. For each, give: name, area/neighborhood (if it's a place), price range in local currency, what it's known for or what to order, a rating with its source if available, and one detail that makes it stand out. Finish with 2-3 surprising facts about the topic that would make a good hook. Keep the notes under 400 words.`;
}

function photoBlocks(photos: PhotoInput[]): Anthropic.Beta.BetaContentBlockParam[] {
  return photos.flatMap((p, i): Anthropic.Beta.BetaContentBlockParam[] => {
    const [, mediaType, data] = p.dataUrl.match(/^data:(image\/(?:jpeg|png));base64,(.*)$/)!;
    return [
      { type: "text", text: `Photo ${i}${p.label ? ` (user's label: ${p.label})` : ""}:` },
      { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png", data } },
    ];
  });
}

function taskText(input: BusinessInput, research?: string): string {
  const values = input.slideCount - 2;
  const type =
    input.postType === "auto"
      ? "Pick the post type that best fits this business, topic and goal."
      : `Post type: "${input.postType}" (${POST_TYPE_INFO[input.postType].label}).`;
  const notes = research ? `\n\nResearch notes (the only source for specific names, prices and ratings):\n${research}` : "";
  return `${describeInput(input)}${notes}

Write an Instagram carousel with exactly ${input.slideCount} slides: 1 hook slide, ${values} value slide(s), and 1 CTA slide. ${type} If the hook or caption promises a count ("5 spots", "3 myths"), that count must be ${values}, the number of value slides.`;
}

export function buildGenerateContent(
  input: BusinessInput,
  photos: PhotoInput[],
  research?: string,
): Anthropic.Beta.BetaContentBlockParam[] {
  const photoNote = photos.length
    ? `\n\nThe user attached ${photos.length} photo(s) above (indexes 0-${photos.length - 1}). Assign them to slides with imageIndex.`
    : "\n\nThe user attached no photos, so every imageIndex is -1.";
  return [...photoBlocks(photos), { type: "text", text: taskText(input, research) + photoNote }];
}

export function buildRepairContent(
  input: BusinessInput,
  photos: PhotoInput[],
  research: string | undefined,
  previous: CarouselPlan,
  issues: string[],
): Anthropic.Beta.BetaContentBlockParam[] {
  return [
    ...buildGenerateContent(input, photos, research),
    {
      type: "text",
      text: `Your previous draft broke some rules:
${issues.map((i) => `- ${i}`).join("\n")}

Previous draft:
${JSON.stringify(previous, null, 2)}

Return the full corrected carousel. Keep everything that already worked.`,
    },
  ];
}

export function buildPaletteContent(
  input: Partial<BusinessInput>,
  photos: PhotoInput[],
): Anthropic.Beta.BetaContentBlockParam[] {
  const about = [
    input.businessName && `Business: ${input.businessName}`,
    input.industry && `Industry: ${input.industry}`,
    input.description && `What it does: ${input.description}`,
    input.audience && `Audience: ${input.audience}`,
    input.voice && `Brand voice: ${input.voice}`,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    ...photoBlocks(photos),
    {
      type: "text",
      text: `${about || "No business details given."}

Pick an Instagram carousel palette and template for this brand, following the Colors rules. ${
        photos.length ? "Pull the colorway from the photos so the slides match them." : "Base it on the brand's vibe."
      }`,
    },
  ];
}

export function buildRegenerateSlidePrompt(
  input: BusinessInput,
  plan: CarouselPlan,
  index: number,
  instruction?: string,
): string {
  const slide = plan.slides[index];
  return `${describeInput(input)}

Here is the current carousel (post type: ${plan.postType}):
${plan.slides.map((s, i) => `Slide ${i + 1} [${s.role}] ${s.kicker} | ${s.headline} | ${s.body} | chips: ${s.chips.join(", ")}`).join("\n")}

Rewrite slide ${index + 1} (role "${slide.role}") so it's stronger and fits with the other slides. Keep its role, keep any real names/facts it contains, and follow the slide rules for that role. Set imageIndex to ${slide.imageIndex}.${
    instruction ? `\nThe user asked for this change: ${instruction}` : ""
  }`;
}
