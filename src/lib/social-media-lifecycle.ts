import { parseStructuredPostContent } from "@/lib/collaboration";

type PostMediaReference = { media_key: string | null; content: string };
type CommentMediaReference = { media_key: string | null };

export function listUnreferencedSocialMediaKeys(params: {
  candidateKeys: string[];
  posts: PostMediaReference[];
  comments: CommentMediaReference[];
}) {
  const referenced = new Set<string>();
  for (const post of params.posts) {
    if (post.media_key) referenced.add(post.media_key);
    const parsed = parseStructuredPostContent(post.content);
    for (const item of parsed.mediaItems) {
      referenced.add(item.mediaKey);
      if (item.posterKey) referenced.add(item.posterKey);
    }
  }
  for (const comment of params.comments) {
    if (comment.media_key) referenced.add(comment.media_key);
  }
  return Array.from(new Set(params.candidateKeys)).filter((key) => !referenced.has(key));
}
