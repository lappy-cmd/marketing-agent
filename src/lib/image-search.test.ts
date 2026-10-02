import { describe, expect, it } from "vitest";
import { filterCandidates } from "./image-search";
import type { ImageCandidate } from "./schemas";

const candidate = (over: Partial<ImageCandidate> = {}): ImageCandidate => ({
  url: "https://img.example.com/a.jpg",
  thumbUrl: "https://img.example.com/a-thumb.jpg",
  width: 1200,
  height: 1500,
  kind: "web",
  sourceName: "example.com",
  author: "",
  pageUrl: "https://example.com/a",
  ...over,
});

describe("filterCandidates", () => {
  it("keeps a good candidate", () => {
    expect(filterCandidates([candidate()])).toHaveLength(1);
  });

  it("drops small images and extreme shapes", () => {
    const raw = [
      candidate({ url: "https://x.com/small.jpg", width: 400, height: 900 }),
      candidate({ url: "https://x.com/short.jpg", width: 900, height: 400 }),
      candidate({ url: "https://x.com/banner.jpg", width: 3000, height: 1000 }),
      candidate({ url: "https://x.com/tall.jpg", width: 700, height: 2000 }),
    ];
    expect(filterCandidates(raw)).toEqual([]);
  });

  it("lets through images whose size is unknown", () => {
    expect(filterCandidates([candidate({ width: 0, height: 0 })])).toHaveLength(1);
  });

  it("drops non-https, svg and gif images", () => {
    const raw = [
      candidate({ url: "http://x.com/a.jpg" }),
      candidate({ url: "https://x.com/b.jpg", thumbUrl: "" }),
      candidate({ url: "https://x.com/logo.svg" }),
      candidate({ url: "https://x.com/anim.GIF?size=large" }),
    ];
    expect(filterCandidates(raw)).toEqual([]);
  });

  it("removes duplicates and caps the list at 6", () => {
    const raw = [candidate(), candidate(), ...Array.from({ length: 8 }, (_, i) => candidate({ url: `https://x.com/${i}.jpg` }))];
    const result = filterCandidates(raw);
    expect(result).toHaveLength(6);
    expect(new Set(result.map((c) => c.url)).size).toBe(6);
  });
});
