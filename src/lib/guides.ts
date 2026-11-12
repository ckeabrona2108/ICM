/** SEO guides for musicians: static content served under /guides. */

import { GUIDE_CATEGORIES, pickRelatedGuides, type Guide } from "@/lib/guide-types";
import { MONEY_GUIDES } from "@/lib/guides-content/money";
import { MONEY_EXTRA_GUIDES } from "@/lib/guides-content/money-extra";
import { PREP_GUIDES } from "@/lib/guides-content/prep";
import { PREP_EXTRA_GUIDES } from "@/lib/guides-content/prep-extra";
import { PROMO_GUIDES } from "@/lib/guides-content/promo";
import { PROMO_EXTRA_GUIDES } from "@/lib/guides-content/promo-extra";
import { RELEASE_GUIDES } from "@/lib/guides-content/release";
import { RELEASE_EXTRA_GUIDES } from "@/lib/guides-content/release-extra";

export {
  GUIDE_CATEGORIES,
  parseGuideInline,
  stripGuideLinks,
  type Guide,
  type GuideBlock,
  type GuideCategory,
  type GuideInlinePart
} from "@/lib/guide-types";

export const GUIDES: Guide[] = [
  ...RELEASE_GUIDES,
  ...RELEASE_EXTRA_GUIDES,
  ...PREP_GUIDES,
  ...PREP_EXTRA_GUIDES,
  ...PROMO_GUIDES,
  ...PROMO_EXTRA_GUIDES,
  ...MONEY_GUIDES,
  ...MONEY_EXTRA_GUIDES
];

export function getGuide(slug: string): Guide | null {
  return GUIDES.find((guide) => guide.slug === slug) ?? null;
}

export function getRelatedGuides(guide: Guide, limit = 3): Guide[] {
  return pickRelatedGuides(guide, GUIDES, limit);
}

export function getGuidesByCategory() {
  return GUIDE_CATEGORIES.map((category) => ({
    ...category,
    guides: GUIDES.filter((guide) => guide.category === category.id)
  })).filter((group) => group.guides.length > 0);
}
