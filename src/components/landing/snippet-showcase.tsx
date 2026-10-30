"use client";

import * as React from "react";
import { Bookmark, Heart, MessageCircle, Play, Send, Share2, Volume2, VolumeX } from "lucide-react";

// Releases on the stage: the phone plays the first, the Share Kit cards show the rest.
const MEDIA = "/landing/snippets";
const PHONE = { title: "While Hood Sleeps", artist: "THIRTEENKILLA", hook: "1:27–1:42", src: `${MEDIA}/main.mp4`, poster: `${MEDIA}/main.jpg` };
// Each card is a different release in a different studio template, so the formats read apart.
const KIT = {
  post: { title: "BRZZRS", artist: "YONAS", handle: "yonas", src: `${MEDIA}/post.mp4`, poster: `${MEDIA}/post.jpg` },
  canvas: { title: "Эй, слышь!", artist: "BARCETON", handle: "barceton", src: `${MEDIA}/canvas.mp4`, poster: `${MEDIA}/canvas.jpg` },
  reels: { title: "КАК ТЫ ЗАРАБОТАЛА?)", artist: "ФЕНИКС", handle: "feniks", src: `${MEDIA}/reels.mp4`, poster: `${MEDIA}/reels.jpg` }
};

// Bars of the trim chip; the lit ones are the chosen hook.
const WAVE = [5, 9, 6, 12, 8, 14, 10, 17, 13, 19, 15, 18, 11, 16, 9, 13, 7, 10, 5, 8];
const HOOK_FROM = 7;
const HOOK_TO = 14;

const CHIP =
  "border border-white/[0.1] bg-[#11121c]/85 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl";

/**
 * A phone with a smart link whose first screen is a playing studio snippet, tilted in 3D
 * with the Share Kit outputs floating around it.
 */
export function SnippetShowcase() {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const rigRef = React.useRef<HTMLDivElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const kitVideos = React.useRef(new Set<HTMLVideoElement>());
  const [visible, setVisible] = React.useState(false);
  const [muted, setMuted] = React.useState(true);

  const kitVideoRef = React.useCallback((video: HTMLVideoElement | null) => {
    if (video) kitVideos.current.add(video);
  }, []);

  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "120px" });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    for (const video of [videoRef.current, ...kitVideos.current]) {
      if (!video) continue;
      if (visible) void video.play().catch(() => {});
      else video.pause();
    }
  }, [visible]);

  // Pointer tilt with easing; without a pointer over the stage the rig sways on its own.
  React.useEffect(() => {
    const stage = stageRef.current;
    const rig = rigRef.current;
    if (!stage || !rig || !visible) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let target: { x: number; y: number } | null = null;
    let x = 0;
    let y = 0;
    let frame = 0;
    const started = performance.now();

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = stage.getBoundingClientRect();
      target = {
        x: ((event.clientX - box.left) / box.width - 0.5) * 2,
        y: ((event.clientY - box.top) / box.height - 0.5) * 2
      };
    };
    const onLeave = () => {
      target = null;
    };
    const tick = (now: number) => {
      const t = (now - started) / 1000;
      const goal = target ?? { x: Math.sin(t * 0.55) * 0.55, y: Math.sin(t * 0.4 + 1) * 0.35 };
      x += (goal.x - x) * 0.06;
      y += (goal.y - y) * 0.06;
      rig.style.setProperty("--ry", `${(-16 + x * 14).toFixed(2)}deg`);
      rig.style.setProperty("--rx", `${(7 - y * 9).toFixed(2)}deg`);
      rig.style.setProperty("--sheen", `${(50 + x * 30).toFixed(1)}%`);
      frame = requestAnimationFrame(tick);
    };

    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
    };
  }, [visible]);

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !muted;
    setMuted(!muted);
  };

  return (
    <div className="relative grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#8b5cf6]/25 bg-[#8b5cf6]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#c4b5fd]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#a78bfa]" />
          Новинка · Snippet Studio
        </span>
        <h2 className="mt-4 text-balance text-[34px] font-bold leading-[1.04] tracking-tight sm:text-[42px] lg:text-[54px]">
          Сниппеты, которые{" "}
          <span className="bg-gradient-to-r from-[#a78bfa] via-[#7b61ff] to-[#5d3dd1] bg-clip-text text-transparent">
            играют прямо в смарт-линке
          </span>
        </h2>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/60 sm:text-[16px]">
          Слушатель открывает ссылку и сразу слышит хук — ещё до перехода на площадку. Видео
          собирается из трека и обложки за пару минут.
        </p>
      </div>

      <div
        ref={stageRef}
        className="relative mx-auto h-[520px] w-full max-w-[560px] [perspective:1400px] sm:h-[600px]"
      >
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(123,97,255,0.34),rgba(93,61,209,0.16)_45%,transparent_70%)] blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute left-[62%] top-[30%] h-[180px] w-[180px] rounded-full bg-[#52d0ff]/10 blur-[70px]" />

        <div
          ref={rigRef}
          className="absolute inset-0 [transform-style:preserve-3d]"
          style={{ transform: "rotateX(var(--rx, 7deg)) rotateY(var(--ry, -16deg))" }}
        >
          {/* Share Kit outputs behind the phone, each dressed as the place it gets posted. */}
          <FloatCard className="left-0 top-[2%] sm:-left-[4%]" z={-90} delay={0}>
            <KitTile label="Пост 1:1" width="w-[128px] sm:w-[152px]">
              <div className="flex items-center gap-1.5 px-1 pb-1.5">
                <span className="h-4 w-4 rounded-full bg-[linear-gradient(135deg,#a78bfa,#5d3dd1)] p-[1.5px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={KIT.post.poster} alt="" className="h-full w-full rounded-full object-cover" />
                </span>
                <span className="truncate text-[9px] font-semibold text-white/85">{KIT.post.handle}</span>
              </div>
              <KitVideo media={KIT.post} visible={visible} ratio="aspect-square" radius="rounded-[10px]" videoRef={kitVideoRef} />
              <div className="flex items-center gap-2 px-1 pt-1.5 text-white/80">
                <Heart className="h-3 w-3" />
                <MessageCircle className="h-3 w-3" />
                <Send className="h-3 w-3" />
                <Bookmark className="ml-auto h-3 w-3" />
              </div>
            </KitTile>
          </FloatCard>
          <FloatCard className="bottom-[6%] right-[1%] sm:right-[3%]" z={-170} delay={1.1}>
            <KitTile label="Spotify Canvas" width="w-[100px] sm:w-[118px]">
              <div className="relative">
                <KitVideo media={KIT.canvas} visible={visible} ratio="aspect-[9/16]" videoRef={kitVideoRef} />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-[14px] bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2 pb-2 pt-8">
                  <div className="truncate text-[10px] font-bold leading-tight text-white">{KIT.canvas.title}</div>
                  <div className="truncate text-[8px] text-white/60">{KIT.canvas.artist}</div>
                  <div className="mt-1.5 h-[2px] rounded-full bg-white/25">
                    <div className="h-full w-[38%] rounded-full bg-white" />
                  </div>
                </div>
              </div>
            </KitTile>
          </FloatCard>
          <FloatCard className="bottom-[1%] hidden sm:-left-[1%] sm:block" z={-60} delay={2.2}>
            <KitTile label="Reels 9:16" width="w-[100px]">
              <div className="relative">
                <KitVideo media={KIT.reels} visible={visible} ratio="aspect-[9/16]" videoRef={kitVideoRef} />
                <div className="pointer-events-none absolute right-1.5 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 text-white drop-shadow">
                  <Heart className="h-3 w-3 fill-white" />
                  <MessageCircle className="h-3 w-3" />
                  <Send className="h-3 w-3" />
                </div>
                <div className="pointer-events-none absolute bottom-1.5 left-1.5 text-[8px] font-semibold text-white drop-shadow">@{KIT.reels.handle}</div>
              </div>
            </KitTile>
          </FloatCard>

          {/* The phone. */}
          <div
            className="absolute left-1/2 top-1/2 w-[228px] [transform-style:preserve-3d] sm:left-[57%] sm:w-[250px]"
            style={{ transform: "translate(-50%, -50%)" }}
          >
            <div
              className="relative rounded-[46px] bg-[linear-gradient(145deg,#2c2a44,#13141f_42%,#0a0b12)] p-[9px] shadow-[0_60px_120px_-40px_rgba(0,0,0,0.95),0_0_90px_-26px_rgba(123,97,255,0.6),0_0_0_1px_rgba(255,255,255,0.09),inset_0_1px_0_rgba(255,255,255,0.18)]"
            >
              <div className="relative aspect-[9/19.2] overflow-hidden rounded-[38px] bg-black">
                <video
                  ref={videoRef}
                  src={visible ? PHONE.src : undefined}
                  poster={PHONE.poster}
                  autoPlay
                  muted={muted}
                  loop
                  playsInline
                  preload="none"
                  aria-label={`Сниппет ${PHONE.title} — ${PHONE.artist} в смарт-линке`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-b from-transparent via-black/60 to-black/90" />
                {/* Glass sheen that slides with the tilt. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 mix-blend-screen"
                  style={{
                    background:
                      "linear-gradient(115deg, transparent calc(var(--sheen, 50%) - 22%), rgba(255,255,255,0.10) var(--sheen, 50%), transparent calc(var(--sheen, 50%) + 18%))"
                  }}
                />

                <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
                    <Share2 className="h-3.5 w-3.5" />
                  </span>
                  <span className="absolute left-1/2 top-3 h-[22px] w-[74px] -translate-x-1/2 rounded-full bg-black" />
                  <button
                    type="button"
                    onClick={toggleSound}
                    aria-label={muted ? "Включить звук" : "Выключить звук"}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/70"
                  >
                    {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                </div>

                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-2.5 pb-3">
                  {[
                    { name: "Яндекс Музыка", icon: "/landing/promo/yandex-music-cover.jpg" },
                    { name: "VK Музыка", icon: "/landing/promo/vk-music-cover.png" }
                  ].map((platform) => (
                    <div
                      key={platform.name}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/45 p-1 pr-1.5 backdrop-blur-md"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={platform.icon} alt="" className="h-6 w-6 rounded-md object-cover" />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white">{platform.name}</span>
                      <span className="rounded-md bg-[#7b61ff] px-2 py-0.5 text-[10px] font-semibold text-white">Слушать</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Chips in front of the phone. */}
          <FloatCard className="left-[2%] top-[44%] sm:-left-[6%]" z={120} delay={0.6}>
            <div className={`rounded-2xl p-3 ${CHIP}`}>
              <div className="flex items-center justify-between gap-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
                <span>Хук</span>
                <span className="tabular-nums text-[#c4b5fd]">{PHONE.hook}</span>
              </div>
              <div className="mt-2 flex h-6 items-center gap-[3px]">
                {WAVE.map((height, index) => {
                  const lit = index >= HOOK_FROM && index <= HOOK_TO;
                  return (
                    <span
                      key={index}
                      className={`w-[3px] rounded-full ${lit ? "bg-[#a78bfa]" : "bg-white/20"}`}
                      style={{
                        height,
                        animation: lit ? `snippet-eq ${0.7 + (index % 3) * 0.18}s ease-in-out ${index * 0.07}s infinite alternate` : undefined
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </FloatCard>
          <FloatCard className="right-[3%] top-[27%] sm:right-[2%]" z={150} delay={1.7}>
            <div className={`flex items-center gap-2 rounded-full py-2 pl-2 pr-4 ${CHIP}`}>
              <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[#7b61ff] shadow-[0_0_20px_-2px_rgba(123,97,255,0.9)]">
                <span className="absolute inset-0 animate-ping rounded-full bg-[#7b61ff]/40" />
                <Play className="relative h-3 w-3 fill-white text-white" />
              </span>
              <span className="text-[12px] font-semibold text-white">Играет в смарт-линке</span>
            </div>
          </FloatCard>
          <FloatCard className="right-[8%] top-[5%] sm:right-[12%]" z={90} delay={2.6}>
            <div className={`rounded-full px-3.5 py-2 text-[12px] font-semibold text-white ${CHIP}`}>
              Share Kit · <span className="text-[#c4b5fd]">5 форматов</span>
            </div>
          </FloatCard>
        </div>
      </div>
    </div>
  );
}

function FloatCard({
  children,
  className,
  z,
  delay
}: {
  children: React.ReactNode;
  className: string;
  z: number;
  delay: number;
}) {
  return (
    <div className={`absolute [transform-style:preserve-3d] ${className}`} style={{ transform: `translateZ(${z}px)` }}>
      <div style={{ animation: `float-soft ${6.4 + delay}s ease-in-out ${delay * 0.4}s infinite` }}>{children}</div>
    </div>
  );
}

function KitTile({ label, width, children }: { label: string; width: string; children: React.ReactNode }) {
  return (
    <div className={`${width} rounded-[18px] p-1.5 ${CHIP}`}>
      {children}
      <div className="px-1 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#c4b5fd]/80">{label}</div>
    </div>
  );
}

function KitVideo({
  media,
  visible,
  ratio,
  radius = "rounded-[14px]",
  videoRef
}: {
  media: { title: string; artist: string; src: string; poster: string };
  visible: boolean;
  ratio: string;
  radius?: string;
  videoRef: (video: HTMLVideoElement | null) => void;
}) {
  return (
    <video
      ref={videoRef}
      src={visible ? media.src : undefined}
      poster={media.poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={`${media.title} — ${media.artist}`}
      className={`${ratio} block w-full ${radius} object-cover`}
    />
  );
}
