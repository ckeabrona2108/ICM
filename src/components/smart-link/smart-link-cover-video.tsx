"use client";

import * as React from "react";
import { Volume2, VolumeX } from "lucide-react";

/** The release snippet from Snippet Studio, playing muted in place of the cover; a tap turns the sound on. */
export function SmartLinkCoverVideo({ src, poster, title }: { src: string; poster: string | null; title: string }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = React.useState(true);

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !muted;
    video.muted = nextMuted;
    if (!nextMuted) {
      video.currentTime = 0;
      void video.play().catch(() => {});
    }
    setMuted(nextMuted);
  };

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={`Сниппет: ${title}`}
        className="h-full w-full object-cover"
      />
      <button
        type="button"
        onClick={toggleSound}
        aria-label={muted ? "Включить звук" : "Выключить звук"}
        className="absolute right-3 top-3 z-[2] flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition hover:bg-black/70"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
