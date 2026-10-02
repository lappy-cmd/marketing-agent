import { describe, expect, it } from "vitest";
import { BusinessInputSchema, MAX_FEATURES } from "./schemas";

const input = (features: string[]) => ({
  businessName: "Makan Club",
  industry: "Food app",
  description: "Rank the places you eat.",
  audience: "Foodies in KL",
  features,
  goal: "engagement",
  voice: "playful",
  slideCount: 5,
  postType: "auto",
});

const features = (n: number) => Array.from({ length: n }, (_, i) => `Feature ${i + 1}`);

describe("BusinessInputSchema features", () => {
  it("accepts more than 3, up to the cap", () => {
    expect(BusinessInputSchema.safeParse(input(features(4))).success).toBe(true);
    expect(BusinessInputSchema.safeParse(input(features(MAX_FEATURES))).success).toBe(true);
  });

  it("rejects none and more than the cap", () => {
    expect(BusinessInputSchema.safeParse(input([])).success).toBe(false);
    expect(BusinessInputSchema.safeParse(input(features(MAX_FEATURES + 1))).success).toBe(false);
  });
});
