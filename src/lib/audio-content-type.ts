const AUDIO_TYPE_BY_EXTENSION: Record<string, string> = {
  wav: "audio/wav",
  flac: "audio/flac",
  mp3: "audio/mpeg",
  aac: "audio/aac",
  m4a: "audio/mp4",
  aif: "audio/aiff",
  aiff: "audio/aiff"
};

// Browsers and operating systems report the same formats under different
// names (Firefox/macOS/Android use audio/x-flac, some Windows setups audio/wave).
const AUDIO_TYPE_ALIASES: Record<string, string> = {
  "audio/x-flac": "audio/flac",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/x-pn-wav": "audio/wav",
  "audio/mp3": "audio/mpeg"
};

export function canonicalAudioContentType(contentType: string): string {
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return AUDIO_TYPE_ALIASES[normalized] ?? normalized;
}

/** Picks the Content-Type from the file extension, falling back to the browser-reported type. */
export function resolveAudioContentType(fileName: string, browserType?: string | null): string {
  const extension = fileName.trim().split(".").at(-1)?.toLowerCase() ?? "";
  const byExtension = AUDIO_TYPE_BY_EXTENSION[extension];
  if (byExtension) return byExtension;
  const canonical = canonicalAudioContentType(browserType ?? "");
  return canonical || "application/octet-stream";
}
