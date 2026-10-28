"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Lock, Music2, Pause, Play, Upload, Wand2 } from "lucide-react";

import { useAudioAnalyzer } from "@/components/video-snippets/use-audio-analyzer";
import type { SubscriptionStateResponse } from "@/lib/api/contracts";
import { cn } from "@/lib/utils";
import { formatSnippetTime, getEffectiveSegment } from "@/lib/video-snippets";
import type { VideoSnippetSource } from "@/lib/video-snippet-sources";

import { extractPalette } from "./scene/palette";
import { TEMPLATES } from "./scene/templates";
import {
  BACKGROUND_LIST,
  createDefaultSceneSettings,
  SNIPPET_FORMATS,
  TEMPLATE_LIST,
  type BackgroundId,
  type SceneAssets,
  type SceneSettings,
  type SnippetFormatId,
  type SpectrumStyle,
  type TemplateCategory,
  type TemplateId,
  type TextAnimation
} from "./scene/types";
import { SceneThumb } from "./scene-thumb";
import { StudioExport } from "./studio-export";
import { StudioPreview } from "./studio-preview";
import { StudioWaveform } from "./studio-waveform";

type InspectorTab = "template" | "background" | "fx" | "text";
type SnippetLength = 15 | 30 | 60;

const CATEGORY_LABELS: Array<{ id: TemplateCategory | "all"; label: string }> = [
  { id: "all", label: "Все" },
  { id: "classic", label: "Классика" },
  { id: "design", label: "Дизайнерские" },
  { id: "audio", label: "На звук" }
];

const CTA_PRESETS = ["Слушай на всех площадках", "Пре-сейв по ссылке", "Уже вышел", "Новый трек"];

const SPECTRUM_OPTIONS: Array<{ id: SpectrumStyle; label: string }> = [
  { id: "bars", label: "Столбики" },
  { id: "line", label: "Линия" },
  { id: "dots", label: "Точки" },
  { id: "off", label: "Без спектра" }
];

const TEXT_ANIMATIONS: Array<{ id: TextAnimation; label: string }> = [
  { id: "static", label: "Статично" },
  { id: "fade", label: "Плавное появление" },
  { id: "kinetic", label: "Кинетика" },
  { id: "bass", label: "Пульс от баса" }
];

const MONTHS = ["ЯНВ", "ФЕВ", "МАР", "АПР", "МАЯ", "ИЮН", "ИЮЛ", "АВГ", "СЕН", "ОКТ", "НОЯ", "ДЕК"];

function badgeForRelease(releaseDate: string) {
  const date = new Date(releaseDate);
  if (Number.isNaN(date.getTime())) return "НОВЫЙ СИНГЛ";
  return date.getTime() > Date.now() ? `ПРЕМЬЕРА · ${date.getDate()} ${MONTHS[date.getMonth()]}` : "УЖЕ НА ПЛОЩАДКАХ";
}

function displayLink(url: string | null) {
  if (!url) return "";
  let readable = url;
  try {
    readable = decodeURI(url);
  } catch {
    readable = url;
  }
  return readable.replace(/^https?:\/\//u, "").replace(/\/$/u, "");
}

function Chip(props: { active?: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.active}
      className={cn(
        "min-h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors disabled:opacity-50",
        props.active ? "border-[#8b72ff]/70 bg-[#7b61ff]/20 text-white" : "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.08]"
      )}
    >
      {props.children}
    </button>
  );
}

function Toggle(props: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void; locked?: boolean }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="flex flex-col gap-0.5 text-[14px] text-white">
        <span className="flex items-center gap-1.5">
          {props.label}
          {props.locked ? <Lock className="h-3.5 w-3.5 text-white/50" aria-label="Только в PRO" /> : null}
        </span>
        {props.hint ? <span className="text-[12px] text-white/60">{props.hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        onClick={() => props.onChange(!props.checked)}
        className={cn("relative h-6 w-[42px] shrink-0 rounded-full transition-colors", props.checked ? "bg-[#7b61ff]" : "bg-[#2a2d44]")}
      >
        <span className={cn("absolute top-[3px] h-[18px] w-[18px] rounded-full transition-all", props.checked ? "left-[21px] bg-white" : "left-[3px] bg-[#9a98ab]")} />
      </button>
    </div>
  );
}

function Slider(props: { label: string; value: number; onChange: (value: number) => void }) {
  const id = React.useId();
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-[14px] text-white">
      <span className="flex justify-between">
        {props.label}
        <span className="tabular-nums text-white/65">{Math.round(props.value * 100)}%</span>
      </span>
      <input id={id} type="range" min={0} max={100} value={Math.round(props.value * 100)} onChange={(event) => props.onChange(Number(event.target.value) / 100)} className="w-full accent-[#7b61ff]" />
    </label>
  );
}

function SectionTitle(props: { children: React.ReactNode }) {
  return <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/60">{props.children}</div>;
}

export function SnippetStudio(props: { initialSeed?: { title?: string; artist?: string; coverUrl?: string; audioUrl?: string } }) {
  const seed = props.initialSeed;
  const [settings, setSettings] = React.useState<SceneSettings>(() => {
    const initial = createDefaultSceneSettings();
    initial.text.title = seed?.title ?? "";
    initial.text.artist = seed?.artist ?? "";
    return initial;
  });
  const [format, setFormat] = React.useState<SnippetFormatId>("story");
  const [length, setLength] = React.useState<SnippetLength>(15);
  const [clipStart, setClipStart] = React.useState(0);
  const [tab, setTab] = React.useState<InspectorTab>("template");
  const [category, setCategory] = React.useState<TemplateCategory | "all">("all");
  const [showSafeZones, setShowSafeZones] = React.useState(false);
  const [autoPalette, setAutoPalette] = React.useState(true);

  const [sources, setSources] = React.useState<VideoSnippetSource[] | null>(null);
  const [releaseId, setReleaseId] = React.useState<string>("");
  const [trackIndex, setTrackIndex] = React.useState<number | null>(null);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(seed?.audioUrl ?? null);
  const [audioFile, setAudioFile] = React.useState<File | null>(null);
  const [audioStatus, setAudioStatus] = React.useState<string | null>(null);
  const [coverUrl, setCoverUrl] = React.useState<string | null>(seed?.coverUrl ?? null);
  const [assets, setAssets] = React.useState<SceneAssets>({ cover: null, coverKey: "none" });
  const [plan, setPlan] = React.useState<string | null>(null);
  const uploadedCoverUrlRef = React.useRef<string | null>(null);

  const canRemoveWatermark = plan === "PRO" || plan === "ENTERPRISE";
  const source = sources?.find((item) => item.releaseId === releaseId) ?? null;

  const { analysisRef, analysis, analysisStatus, resolvedAudioBuffer, currentTime, durationSeconds, isPlaying, isReady, play, pause, stop } = useAudioAnalyzer({
    audioUrl: audioFile ? null : audioUrl,
    audioFile,
    audioBuffer: null,
    autoDetectEnabled: true,
    startOffset: clipStart
  });

  const trackDuration = durationSeconds || resolvedAudioBuffer?.duration || 0;
  const segment = getEffectiveSegment({ audioDuration: trackDuration, startTime: clipStart, requestedDuration: length });
  const clipDuration = segment.durationSeconds || length;
  const dropTrackTime = analysis.confidence > 0 ? analysis.dropAt : null;

  const updateSettings = React.useCallback((patch: Partial<SceneSettings>) => setSettings((current) => ({ ...current, ...patch })), []);
  const updateText = (patch: Partial<SceneSettings["text"]>) => setSettings((current) => ({ ...current, text: { ...current.text, ...patch } }));
  const updateFx = (patch: Partial<SceneSettings["fx"]>) => setSettings((current) => ({ ...current, fx: { ...current.fx, ...patch } }));

  // The scene draws its type with these families, in the preview and in the exported file alike.
  React.useEffect(() => {
    const id = "snippet-studio-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);

  // Releases from the catalogue.
  React.useEffect(() => {
    let active = true;
    fetch("/api/dashboard/video-snippets/sources", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { sources: [] }))
      .then((payload: { sources?: VideoSnippetSource[] }) => {
        if (active) setSources(payload.sources ?? []);
      })
      .catch(() => active && setSources([]));
    fetch("/api/subscription", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<SubscriptionStateResponse>) : null))
      .then((payload) => {
        if (active && payload) setPlan(payload.subscription.currentPlan ?? payload.subscription.plan ?? "STANDARD");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Cover → image + palette.
  React.useEffect(() => {
    if (!coverUrl) {
      setAssets({ cover: null, coverKey: "none" });
      return;
    }
    let active = true;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (!active) return;
      setAssets({ cover: image, coverKey: coverUrl });
      if (autoPalette) setSettings((current) => ({ ...current, palette: extractPalette(image) }));
    };
    image.onerror = () => active && setAssets({ cover: null, coverKey: "none" });
    image.src = coverUrl;
    return () => {
      active = false;
    };
    // The palette is re-read only when the cover changes, not when auto mode is toggled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverUrl]);

  React.useEffect(() => () => {
    if (uploadedCoverUrlRef.current) URL.revokeObjectURL(uploadedCoverUrlRef.current);
  }, []);

  // Jump to the best moment once the analysis of a new track arrives.
  React.useEffect(() => {
    if (analysis.confidence <= 0 || trackDuration <= 0) return;
    const preferred = analysis.chorusStart > 0 ? analysis.chorusStart : analysis.dropAt - length * 0.35;
    setClipStart(getEffectiveSegment({ audioDuration: trackDuration, startTime: preferred, requestedDuration: length }).startTime);
    // Only a new analysis (new track) should move the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  const selectRelease = async (nextId: string, nextTrack?: number) => {
    await stop();
    setReleaseId(nextId);
    const next = sources?.find((item) => item.releaseId === nextId);
    if (!next) return;
    const index = nextTrack ?? next.tracks[0]?.index ?? 0;
    setTrackIndex(index);
    setAudioFile(null);
    setCoverUrl(next.coverUrl);
    setSettings((current) => ({
      ...current,
      text: {
        ...current.text,
        title: next.tracks.find((track) => track.index === index)?.title || next.title,
        artist: next.artist,
        badge: badgeForRelease(next.releaseDate),
        cta: new Date(next.releaseDate).getTime() > Date.now() ? "Пре-сейв по ссылке" : "Слушай на всех площадках",
        link: displayLink(next.smartLinkUrl)
      }
    }));
    setAudioUrl(null);
    setAudioStatus("Ищем аудио трека…");
    try {
      const response = await fetch(`/api/dashboard/video-snippets/sources/${nextId}/audio?track=${index}`, { cache: "no-store" });
      const payload = (await response.json()) as { audioUrl?: string; error?: string };
      if (!response.ok || !payload.audioUrl) {
        setAudioStatus(payload.error ?? "Аудио трека не найдено — загрузи файл вручную.");
        return;
      }
      setAudioUrl(payload.audioUrl);
      setAudioStatus(null);
    } catch {
      setAudioStatus("Не удалось загрузить аудио — загрузи файл вручную.");
    }
  };

  const onAudioUpload = async (file: File | null) => {
    if (!file) return;
    await stop();
    setAudioFile(file);
    setAudioStatus(null);
    if (!settings.text.title) updateText({ title: file.name.replace(/\.[^.]+$/u, "") });
  };

  const onCoverUpload = (file: File | null) => {
    if (!file) return;
    if (uploadedCoverUrlRef.current) URL.revokeObjectURL(uploadedCoverUrlRef.current);
    const url = URL.createObjectURL(file);
    uploadedCoverUrlRef.current = url;
    setCoverUrl(url);
  };

  const changeClipStart = (time: number) => {
    if (isPlaying) void stop();
    setClipStart(time);
  };

  const togglePlay = async () => {
    if (isPlaying) {
      await pause();
      return;
    }
    const inside = currentTime >= segment.startTime && currentTime < segment.endTime - 0.1;
    const from = inside ? currentTime : segment.startTime;
    await play({ fromTime: from, durationSeconds: Math.max(0.1, segment.endTime - from) });
  };

  const applyBestMoment = () => {
    if (analysis.confidence <= 0) return;
    const preferred = analysis.chorusStart > 0 ? analysis.chorusStart : analysis.dropAt - length * 0.35;
    changeClipStart(getEffectiveSegment({ audioDuration: trackDuration, startTime: preferred, requestedDuration: length }).startTime);
  };

  const markers = analysis.confidence > 0
    ? [
        { time: analysis.chorusStart, label: "Припев", tone: "violet" as const },
        { time: analysis.dropAt, label: "Дроп", tone: "mint" as const }
      ].filter((marker) => marker.time > 0 && marker.time < trackDuration)
    : [];

  const templateOwnsBackground = Boolean(TEMPLATES[settings.template].ownBackground);
  const fileBase = (settings.text.title || "snippet").toLowerCase().replace(/[^a-z0-9а-яё]+/giu, "-").replace(/^-+|-+$/gu, "") || "snippet";
  const exportBlocker = !isReady || !resolvedAudioBuffer ? "Сначала выбери релиз или загрузи трек" : null;

  const thumbSettings = React.useMemo(() => ({ ...settings, fx: { ...settings.fx, glow: 0 } }), [settings]);
  const visibleTemplates = TEMPLATE_LIST.filter((template) => category === "all" || template.category === category);

  const card = "rounded-[20px] border border-white/[0.08] bg-[#161826] p-4 sm:p-5";

  return (
    <div className="flex flex-col gap-5 text-white">
      {/* Source */}
      <section aria-label="Релиз и трек" className={cn(card, "flex flex-wrap items-center gap-4")}>
        <div className="flex min-w-0 flex-[1_1_100%] items-center gap-3 md:flex-[1_1_320px]">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/[0.06]">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Music2 className="m-4 h-6 w-6 text-white/40" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label className="relative">
              <span className="sr-only">Релиз из каталога</span>
              <select
                value={releaseId}
                onChange={(event) => void selectRelease(event.target.value)}
                className="h-11 w-full appearance-none truncate rounded-xl border border-white/10 bg-[#11131f] pl-3 pr-9 text-[14px] font-semibold text-white"
              >
                <option value="">{sources === null ? "Загружаем релизы…" : sources.length ? "Выбери релиз из каталога" : "Релизов с треками пока нет"}</option>
                {(sources ?? []).map((item) => (
                  <option key={item.releaseId} value={item.releaseId}>
                    {item.title} — {item.artist}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-white/60" />
            </label>
            <span className="flex min-w-0 items-center gap-2 text-[12px] text-white/60">
              <span className="truncate">
                {audioStatus ?? (audioFile ? `Свой файл: ${audioFile.name}` : source ? `Обложка, название и смарт-линк подставлены из релиза` : analysisStatus)}
              </span>
              {audioStatus && releaseId && !audioStatus.startsWith("Ищем") ? (
                <button type="button" onClick={() => void selectRelease(releaseId, trackIndex ?? undefined)} className="shrink-0 font-semibold text-[#b3a6ff] hover:text-[#d6ceff]">
                  Повторить
                </button>
              ) : null}
            </span>
          </div>
        </div>
        {source && source.tracks.length > 1 ? (
          <label className="relative">
            <span className="sr-only">Трек</span>
            <select
              value={trackIndex ?? ""}
              onChange={(event) => void selectRelease(releaseId, Number(event.target.value))}
              className="h-11 appearance-none rounded-xl border border-white/10 bg-[#11131f] pl-3 pr-9 text-[14px] text-white"
            >
              {source.tracks.map((track) => (
                <option key={track.index} value={track.index}>
                  {track.title}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-white/60" />
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[13px] font-medium text-white/85 hover:bg-white/[0.08]">
            <Upload className="h-4 w-4" /> Свой трек
            <input type="file" accept=".mp3,.wav,.m4a,.aac,audio/*" className="sr-only" onChange={(event) => void onAudioUpload(event.target.files?.[0] ?? null)} />
          </label>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[13px] font-medium text-white/85 hover:bg-white/[0.08]">
            <Upload className="h-4 w-4" /> Обложка
            <input type="file" accept=".jpg,.jpeg,.png,.webp,image/*" className="sr-only" onChange={(event) => onCoverUpload(event.target.files?.[0] ?? null)} />
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-5">
        {/* Stage */}
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
          <section aria-label="Превью" className={card}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div role="group" aria-label="Формат" className="flex gap-1 rounded-[13px] bg-[#11131f] p-1">
                {(Object.keys(SNIPPET_FORMATS) as SnippetFormatId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={format === id}
                    onClick={() => setFormat(id)}
                    className={cn("min-h-[38px] rounded-[10px] px-3.5 text-[13px] font-semibold", format === id ? "bg-[#2a2d44] text-white" : "text-white/70 hover:text-white")}
                  >
                    {SNIPPET_FORMATS[id].label}
                  </button>
                ))}
              </div>
              {format === "story" ? <Toggle label="Безопасные зоны" checked={showSafeZones} onChange={setShowSafeZones} /> : null}
            </div>
            <div
              className="flex items-center justify-center rounded-2xl p-4"
              style={{ backgroundColor: "#0e101b", backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
            >
              <StudioPreview
                format={format}
                settings={settings}
                assets={assets}
                clipStart={segment.startTime}
                clipDuration={clipDuration}
                trackDuration={trackDuration}
                dropTrackTime={dropTrackTime}
                isPlaying={isPlaying}
                analysisRef={analysisRef}
                showSafeZones={showSafeZones}
                className={format === "story" ? "w-full max-w-[340px]" : format === "square" ? "w-full max-w-[460px]" : "w-full max-w-[640px]"}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void togglePlay()}
                disabled={!isReady}
                aria-label={isPlaying ? "Пауза" : "Воспроизвести фрагмент"}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#14112e] disabled:opacity-40"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </button>
              <span className="text-[14px] tabular-nums">
                {formatSnippetTime(segment.startTime)} – {formatSnippetTime(segment.endTime)}
                <span className="text-white/60"> · {Math.round(clipDuration)} с</span>
              </span>
              <span className="ml-auto text-[12px] text-white/55">Превью = готовое видео, кадр в кадр</span>
            </div>
          </section>

          <section aria-label="Фрагмент трека" className={cn(card, "flex flex-col gap-4")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 font-display text-[16px] font-semibold">Фрагмент</span>
              <Chip onClick={applyBestMoment} disabled={analysis.confidence <= 0}>
                <span className="inline-flex items-center gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" /> Авто: лучший момент
                </span>
              </Chip>
              {([15, 30, 60] as const).map((value) => (
                <Chip key={value} active={length === value} onClick={() => setLength(value)}>
                  {value} с
                </Chip>
              ))}
            </div>
            <StudioWaveform
              audioBuffer={resolvedAudioBuffer}
              trackDuration={trackDuration}
              clipStart={segment.startTime}
              clipDuration={clipDuration}
              currentTime={currentTime}
              isPlaying={isPlaying}
              markers={markers}
              onClipStartChange={changeClipStart}
            />
          </section>
        </div>

        {/* Inspector */}
        <aside className={cn(card, "flex min-w-0 flex-[1_1_340px] flex-col gap-4 pt-2 lg:max-w-[420px]")}>
          <div role="tablist" aria-label="Настройки" className="flex gap-5 border-b border-white/[0.08]">
            {(
              [
                ["template", "Шаблон"],
                ["background", "Фон"],
                ["fx", "Эффекты"],
                ["text", "Текст"]
              ] as Array<[InspectorTab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn("border-b-2 py-3 text-[14px] font-semibold", tab === id ? "border-[#7b61ff] text-white" : "border-transparent text-white/65 hover:text-white")}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "template" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_LABELS.map((item) => (
                  <Chip key={item.id} active={category === item.id} onClick={() => setCategory(item.id)}>
                    {item.label}
                  </Chip>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {visibleTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={settings.template === template.id}
                    onClick={() => updateSettings({ template: template.id as TemplateId })}
                    title={template.description}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-[14px] border bg-[#1b1e2e] p-1.5 text-left",
                      settings.template === template.id ? "border-[#8b72ff] shadow-[0_0_0_3px_rgba(123,97,255,0.28)]" : "border-white/[0.08] hover:border-white/20"
                    )}
                  >
                    <SceneThumb settings={{ ...thumbSettings, template: template.id }} assets={assets} width={135} height={240} className="aspect-[9/16] w-full rounded-[10px]" />
                    <span className="px-1 pb-0.5 text-[12px] font-semibold">{template.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "background" ? (
            <div className="flex flex-col gap-4">
              {templateOwnsBackground ? (
                <p className="rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-[12px] text-white/65">
                  У шаблона «{TEMPLATE_LIST.find((item) => item.id === settings.template)?.name}» свой фон. Живые фоны работают с «Премьерой», «Винилом», «Стеклом», «Плеером» и «Неон-орбом».
                </p>
              ) : null}
              <div className="grid grid-cols-4 gap-2">
                {BACKGROUND_LIST.map((background) => (
                  <button
                    key={background.id}
                    type="button"
                    aria-pressed={settings.background === background.id}
                    onClick={() => updateSettings({ background: background.id as BackgroundId })}
                    title={background.description}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-xl border bg-[#1b1e2e] p-1 text-left",
                      settings.background === background.id ? "border-[#8b72ff] shadow-[0_0_0_3px_rgba(123,97,255,0.28)]" : "border-white/[0.08] hover:border-white/20"
                    )}
                  >
                    <SceneThumb
                      settings={{ ...thumbSettings, template: "premiere", background: background.id, text: { ...settings.text, title: " ", artist: " ", cta: "", badge: "", link: "" }, spectrum: "off" }}
                      assets={assets}
                      width={90}
                      height={140}
                      className="aspect-[9/14] w-full rounded-lg"
                    />
                    <span className="truncate px-0.5 text-[11px] font-semibold">{background.name}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-white/75">Скорость перетекания</span>
                <div role="group" aria-label="Скорость" className="flex gap-1 rounded-[13px] bg-[#11131f] p-1">
                  {(["Медленно", "Спокойно", "Живо"] as const).map((label, index) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={settings.backgroundSpeed === index}
                      onClick={() => updateSettings({ backgroundSpeed: index as 0 | 1 | 2 })}
                      className={cn("min-h-[38px] flex-1 rounded-[10px] text-[13px] font-semibold", settings.backgroundSpeed === index ? "bg-[#2a2d44] text-white" : "text-white/70")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <Slider label="Размытие" value={settings.backgroundBlur} onChange={(value) => updateSettings({ backgroundBlur: value })} />
              <Toggle label="Дышит в такт басу" hint="Фон слегка вздрагивает на бочку" checked={settings.backgroundBeat} onChange={(value) => updateSettings({ backgroundBeat: value })} />
              <Toggle label="Зерно плёнки" hint="Убирает «пластиковость» градиента" checked={settings.grain} onChange={(value) => updateSettings({ grain: value })} />
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-semibold">Палитра</span>
                  <Chip
                    active={autoPalette}
                    onClick={() => {
                      const next = !autoPalette;
                      setAutoPalette(next);
                      if (next && assets.cover) updateSettings({ palette: extractPalette(assets.cover) });
                    }}
                  >
                    Из обложки
                  </Chip>
                </div>
                <div className="flex gap-2">
                  {settings.palette.map((color, index) => (
                    <label key={index} className="relative h-10 w-10 cursor-pointer overflow-hidden rounded-[10px] ring-1 ring-white/15" style={{ background: color }}>
                      <span className="sr-only">Цвет {index + 1}</span>
                      <input
                        type="color"
                        value={color.startsWith("#") ? color : "#7b61ff"}
                        onChange={(event) => {
                          setAutoPalette(false);
                          const palette = [...settings.palette] as SceneSettings["palette"];
                          palette[index] = event.target.value;
                          updateSettings({ palette });
                        }}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "fx" ? (
            <div className="flex flex-col gap-4">
              <SectionTitle>Реакция на звук</SectionTitle>
              <Slider label="Пульс обложки от баса" value={settings.fx.bassPulse} onChange={(value) => updateFx({ bassPulse: value })} />
              <Slider label="Наезд камеры на бочку" value={settings.fx.cameraZoom} onChange={(value) => updateFx({ cameraZoom: value })} />
              <Slider label="Свечение на пиках" value={settings.fx.glow} onChange={(value) => updateFx({ glow: value })} />
              <Toggle label="Удар на дропе" hint={dropTrackTime !== null ? `Зум и вспышка в ${formatSnippetTime(dropTrackTime)}` : "Сработает, когда найдём дроп"} checked={settings.fx.dropHit} onChange={(value) => updateFx({ dropHit: value })} />
              <Toggle label="Глитч на бочку" hint="RGB-сдвиг и полосы на каждую долю" checked={settings.fx.kickGlitch} onChange={(value) => updateFx({ kickGlitch: value })} />
              <Toggle label="Тряска камеры" hint="На самых громких местах" checked={settings.fx.shake} onChange={(value) => updateFx({ shake: value })} />
              <Toggle label="Вспышка" hint="Мягкая, без стробоскопа" checked={settings.fx.flash} onChange={(value) => updateFx({ flash: value })} />
              <SectionTitle>Спектр</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {SPECTRUM_OPTIONS.map((option) => (
                  <Chip key={option.id} active={settings.spectrum === option.id} onClick={() => updateSettings({ spectrum: option.id })}>
                    {option.label}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "text" ? (
            <div className="flex flex-col gap-4">
              {(
                [
                  ["badge", "Плашка сверху"],
                  ["title", "Название"],
                  ["artist", "Артист"]
                ] as Array<["badge" | "title" | "artist", string]>
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-1.5 text-[13px] text-white/75">
                  {label}
                  <input
                    value={settings.text[key]}
                    onChange={(event) => updateText({ [key]: event.target.value })}
                    placeholder={key === "badge" ? "ПРЕМЬЕРА · 31 ОКТ" : key === "title" ? "Название трека" : "Имя артиста"}
                    className="h-11 rounded-[10px] border border-white/10 bg-[#11131f] px-3 text-[14px] font-medium text-white placeholder:text-white/35"
                  />
                </label>
              ))}
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-white/75">Призыв</span>
                <div className="flex flex-wrap gap-1.5">
                  {CTA_PRESETS.map((preset) => (
                    <Chip key={preset} active={settings.text.cta === preset} onClick={() => updateText({ cta: preset })}>
                      {preset}
                    </Chip>
                  ))}
                </div>
                <input
                  aria-label="Свой призыв"
                  value={settings.text.cta}
                  onChange={(event) => updateText({ cta: event.target.value })}
                  className="h-11 rounded-[10px] border border-white/10 bg-[#11131f] px-3 text-[14px] font-medium text-white"
                />
              </div>
              <Toggle label="Смарт-линк в кадре" hint={settings.text.link || "Подставится из релиза"} checked={settings.showLink} onChange={(value) => updateSettings({ showLink: value })} />
              {settings.showLink ? (
                <input
                  aria-label="Ссылка в кадре"
                  value={settings.text.link}
                  onChange={(event) => updateText({ link: event.target.value })}
                  placeholder="icecreammusic.net/l/твой-релиз"
                  className="h-11 rounded-[10px] border border-white/10 bg-[#11131f] px-3 font-mono text-[13px] text-white placeholder:text-white/35"
                />
              ) : null}
              <Toggle label="Финальная карточка" hint="Последние 2 секунды: обложка, призыв и ссылка" checked={settings.endCard} onChange={(value) => updateSettings({ endCard: value })} />
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-white/75">Анимация текста</span>
                <div className="flex flex-wrap gap-1.5">
                  {TEXT_ANIMATIONS.map((option) => (
                    <Chip key={option.id} active={settings.textAnimation === option.id} onClick={() => updateSettings({ textAnimation: option.id })}>
                      {option.label}
                    </Chip>
                  ))}
                </div>
              </div>
              <Toggle
                label="Убрать вотермарку"
                hint={canRemoveWatermark ? "Доступно в твоём тарифе" : "Доступно в PRO"}
                locked={!canRemoveWatermark}
                checked={!settings.watermark}
                onChange={(value) => {
                  if (!canRemoveWatermark) {
                    window.location.href = "/dashboard/subscription";
                    return;
                  }
                  updateSettings({ watermark: !value });
                }}
              />
            </div>
          ) : null}
        </aside>
      </div>

      <section aria-label="Экспорт" className={cn(card, "flex flex-col gap-4")}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-[20px] font-bold">Экспорт</h2>
            <p className="text-[13px] text-white/65">MP4 · H.264 + AAC. Отметь форматы — соберём все за один раз.</p>
          </div>
          <Link href="/dashboard/video-snippets?editor=classic" className="text-[13px] font-medium text-[#b3a6ff] hover:text-[#d6ceff]">
            Классический редактор →
          </Link>
        </div>
        <StudioExport
          settings={settings}
          assets={assets}
          audioBuffer={resolvedAudioBuffer}
          clipStart={segment.startTime}
          clipDuration={clipDuration}
          trackDuration={trackDuration}
          dropTrackTime={dropTrackTime}
          fileBase={fileBase}
          smartLinkUrl={source?.smartLinkUrl ?? null}
          releaseId={source?.releaseId ?? null}
          disabledReason={exportBlocker}
        />
      </section>
    </div>
  );
}
