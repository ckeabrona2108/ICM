import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ReleaseStatus } from "@prisma/client";

import { PromoLanding } from "@/components/promo/promo-landing";
import { prisma } from "@/lib/prisma";

type PromoReleaseData = {
  id: string;
  title: string;
  user: {
    name: string;
  };
  submissionData: unknown;
  coverImage: {
    url: string;
  } | null;
};

function parsePromoSubmissionData(value: unknown): {
  title?: string;
  persons?: Array<{ name?: string; role?: string }>;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as {
    title?: string;
    persons?: Array<{ name?: string; role?: string }>;
  };
}

function derivePromoArtist(release: PromoReleaseData): string {
  const submissionData = parsePromoSubmissionData(release.submissionData);
  const persons = submissionData?.persons ?? [];
  const preferred = persons.find((person) => {
    const role = person.role?.toLowerCase() ?? "";
    return role.includes("исполн") || role.includes("artist");
  });

  return preferred?.name?.trim() || persons[0]?.name?.trim() || "Исполнитель";
}

function derivePromoTitle(release: PromoReleaseData): string {
  const submissionData = parsePromoSubmissionData(release.submissionData);
  return submissionData?.title?.trim() || release.title || "Релиз";
}

async function getPromotableRelease(id: string): Promise<PromoReleaseData | null> {
  return prisma.release.findFirst({
    where: {
      id,
      status: {
        in: [ReleaseStatus.APPROVED, ReleaseStatus.DISTRIBUTED]
      }
    },
    select: {
      id: true,
      title: true,
      submissionData: true,
      user: {
        select: {
          name: true
        }
      },
      coverImage: {
        select: {
          url: true
        }
      }
    }
  });
}

export async function generateMetadata({
  params
}: {
  params: { id: string };
}): Promise<Metadata> {
  const release = await getPromotableRelease(params.id);
  const title = release ? derivePromoTitle(release) : "Релиз";
  const artist = release ? derivePromoArtist(release) : "";

  return {
    title: `${title}${artist ? ` — ${artist}` : ""} · ICM`,
    description: "Слушайте релиз на всех площадках"
  };
}

export default async function PromoPage({ params }: { params: { id: string } }) {
  const release = await getPromotableRelease(params.id);
  if (!release) notFound();

  return (
    <PromoLanding
      cover={release.coverImage?.url ?? "/hero/drop.png"}
      title={derivePromoTitle(release)}
      artist={derivePromoArtist(release)}
    />
  );
}
