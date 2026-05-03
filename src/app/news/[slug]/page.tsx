import { NewsDetailClient } from "@/components/news/news-detail-client";

export default function NewsDetailsPage({ params }: { params: { slug: string } }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <NewsDetailClient slug={params.slug} />
    </main>
  );
}
