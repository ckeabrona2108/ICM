import { VideoSnippetsPage } from "@/components/video-snippets/video-snippets-page";

export default function VideoSnippetsRoute({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return <VideoSnippetsPage searchParams={searchParams} />;
}

