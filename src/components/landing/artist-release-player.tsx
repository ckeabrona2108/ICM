"use client";

import * as React from "react";
import { Headphones, Pause, Play } from "lucide-react";

export function ArtistReleasePlayer({
  releaseId,
  title,
  audioUrl,
  initialPlayCount
}: {
  releaseId: string;
  title: string;
  audioUrl: string | null;
  initialPlayCount: number;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const registeredRef = React.useRef(false);
  const [playing, setPlaying] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [playCount, setPlayCount] = React.useState(initialPlayCount);

  async function registerPlay() {
    if (registeredRef.current) return;
    registeredRef.current = true;
    const response = await fetch(`/api/scene/releases/${releaseId}/play`, { method: "POST" });
    const payload = await response.json().catch(() => null) as { count?: number } | null;
    if (response.ok && typeof payload?.count === "number") setPlayCount(payload.count);
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play().catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  }

  if (!audioUrl || failed) {
    return (
      <div className="mt-5 flex items-center gap-2 text-xs text-white/42">
        <Headphones className="h-4 w-4" /> Фрагмент пока не добавлен
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onPlay={() => {
          setPlaying(true);
          void registerPlay();
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          registeredRef.current = false;
        }}
        onError={() => setFailed(true)}
      />
      <button
        type="button"
        onClick={() => void togglePlayback()}
        className="ux-button-primary inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-white"
        aria-label={`${playing ? "Поставить на паузу" : "Слушать"} ${title}`}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {playing ? "Пауза" : "Слушать"}
      </button>
      <span className="inline-flex items-center gap-1.5 text-xs text-white/42">
        <Headphones className="h-3.5 w-3.5" /> {playCount.toLocaleString("ru-RU")}
      </span>
    </div>
  );
}
