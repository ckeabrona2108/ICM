/** SEO guides for musicians: static content served under /guides. */

import { GUIDE_CATEGORIES, pickRelatedGuides, type Guide } from "@/lib/guide-types";
import { MONEY_GUIDES } from "@/lib/guides-content/money";
import { PREP_GUIDES } from "@/lib/guides-content/prep";
import { PROMO_GUIDES } from "@/lib/guides-content/promo";
import { RELEASE_GUIDES } from "@/lib/guides-content/release";

export {
  GUIDE_CATEGORIES,
  parseGuideInline,
  stripGuideLinks,
  type Guide,
  type GuideBlock,
  type GuideCategory,
  type GuideInlinePart
} from "@/lib/guide-types";

export const GUIDES: Guide[] = [...RELEASE_GUIDES, ...PREP_GUIDES, ...PROMO_GUIDES, ...MONEY_GUIDES];

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
