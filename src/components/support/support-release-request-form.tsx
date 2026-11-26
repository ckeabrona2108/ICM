"use client";

import * as React from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Loader2, RotateCw, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SupportReleaseOption } from "@/lib/api/contracts";
import {
  SUPPORT_PLATFORM_LINK_HINTS,
  SUPPORT_RELEASE_PLATFORMS,
  SUPPORT_RELEASE_REQUEST_TYPES,
  getSupportReleaseRequestType,
  splitSupportLinks,
  type SupportReleasePlatform,
  type SupportReleaseRequestInput,
  type SupportReleaseRequestType
} from "@/lib/support-release-request";
import { SupportReleaseCover } from "@/components/support/support-release-card";

const LINK_RE = /^https?:\/\/\S+$/iu;

const inputClass =
  "ux-control h-12 w-full rounded-[18px] px-4 text-[15px] font-medium text-white placeholder:text-white/35 outline-none focus:border-[#7b61ff]/60 focus:bg-white/[0.055]";
const textareaClass =
  "ux-control w-full resize-none rounded-[22px] px-4 py-3 text-[15px] leading-6 text-white placeholder:text-white/35 outline-none focus:border-[#7b61ff]/60 focus:bg-white/[0.055]";

const STEPS = ["Релиз", "Что сделать", "Детали"] as const;
type Step = 0 | 1 | 2;

/**
 * "Релиз и модерация" in three steps: pick the release (accepted / on moderation lists),
 * pick what needs doing, then fill only the fields that scenario needs.
 */
export function SupportReleaseRequestForm({
  saving,
  onSubmit,
  onCancel,
  onPlainTicket,
  releases,
  releasesError,
  onReloadReleases
}: {
  saving: boolean;
  onSubmit: (request: SupportReleaseRequestInput) => void;
  onCancel: () => void;
  /** Switch to a normal ticket when the question is not about one release. */
  onPlainTicket: () => void;
  /** Loaded by the support page in the background; null while loading. */
  releases: SupportReleaseOption[] | null;
  releasesError: string | null;
  onReloadReleases: () => void;
}) {
  const [step, setStep] = React.useState<Step>(0);
  const [search, setSearch] = React.useState("");
  const [openGroups, setOpenGroups] = React.useState<Record<SupportReleaseOption["group"], boolean>>({
    accepted: true,
    moderation: false
  });
  const [releaseId, setReleaseId] = React.useState<string | null>(null);
  const [requestType, setRequestType] = React.useState<SupportReleaseRequestType | null>(null);
  const [platforms, setPlatforms] = React.useState<SupportReleasePlatform[]>([]);
  // Links are kept per platform, so unticking a store and ticking it back keeps what was typed.
  const [links, setLinks] = React.useState<Partial<Record<SupportReleasePlatform, { card: string; releases: string }>>>(
    {}
  );
  const setPlatformLink = (platform: SupportReleasePlatform, field: "card" | "releases", value: string) =>
    setLinks((prev) => ({
      ...prev,
      [platform]: { card: "", releases: "", ...prev[platform], [field]: value }
    }));
  const [comment, setComment] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  const selected = releases?.find((release) => release.id === releaseId) ?? null;
  const type = requestType ? getSupportReleaseRequestType(requestType) : null;
  const query = search.trim().toLowerCase();
  const visible = (releases ?? []).filter(
    (release) =>
      !query ||
      release.title.toLowerCase().includes(query) ||
      release.artist.toLowerCase().includes(query) ||
      (release.upc ?? "").includes(query)
  );

  const goTo = (next: Step) => {
    setFieldError(null);
    setStep(next);
  };

  const needsLinks = Boolean(type?.needsCardUrl || type?.needsReleaseUrls);

  // A newly ticked store gets its links block at the bottom: bring it into view.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const blockRefs = React.useRef(new Map<string, HTMLDivElement>());
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!justAdded) return;
    blockRefs.current.get(justAdded)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setJustAdded(null);
  }, [justAdded]);
  React.useEffect(() => {
    // Each step starts at the top of the scroll area.
    scrollRef.current?.scrollTo({ top: 0 });
  }, [step]);

  const submit = () => {
    const platformLinks = platforms.map((platform) => ({
      platform,
      cardUrl: links[platform]?.card.trim() ?? "",
      releaseUrls: splitSupportLinks(links[platform]?.releases ?? "")
    }));
    let error: string | null = null;
    if (!releaseId) error = "Выберите релиз.";
    else if (!type) error = "Выберите, что нужно сделать.";
    else if (type.needsPlatforms && platforms.length === 0) error = "Выберите площадку.";
    else if (type.id === "other" && comment.trim().length < 3) error = "Опишите вопрос подробнее.";
    else if (needsLinks) {
      for (const item of platformLinks) {
        if (type.needsCardUrl && !LINK_RE.test(item.cardUrl)) {
          error = `${item.platform}: вставьте ссылку на карточку артиста (https://…).`;
        } else if (type.id === "remove_from_card" && item.releaseUrls.length === 0) {
          error = `${item.platform}: вставьте ссылку на релиз, который нужно убрать.`;
        } else if (item.releaseUrls.some((link) => !LINK_RE.test(link))) {
          error = `${item.platform}: ссылки на релизы должны начинаться с https://`;
        }
        if (error) break;
      }
    }
    setFieldError(error);
    if (error || !releaseId || !type) return;

    onSubmit({
      releaseId,
      requestType: type.id,
      platforms: type.needsPlatforms ? platforms : [],
      platformLinks: needsLinks ? platformLinks : [],
      comment: comment.trim()
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c7bcff]">Релиз и модерация</p>
            <h2 className="mt-3 text-[26px] font-semibold tracking-[-0.03em] text-white">
              {step === 0 ? "Выберите релиз" : step === 1 ? "Что нужно сделать?" : (type?.title ?? "Детали")}
            </h2>
          </div>
          <Stepper
            step={step}
            canOpen={(index) => index === 0 || (index === 1 && !!releaseId) || (index === 2 && !!releaseId && !!type)}
            onOpen={goTo}
          />
        </div>

        {step > 0 && selected ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <SummaryChip onClick={() => goTo(0)}>
              <SupportReleaseCover src={selected.coverUrl} className="h-6 w-6 rounded-md" />
              <span className="max-w-[220px] truncate">{selected.title}</span>
              <span className="font-mono text-white/45">{selected.upc ?? "без UPC"}</span>
            </SummaryChip>
          </div>
        ) : null}

        <div className="mt-5 flex-1">
          {step === 0 ? (
            <div>
              <label className="flex h-11 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-white/45 focus-within:border-[#7b61ff]/50">
                <Search className="h-4 w-4 shrink-0" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Название или UPC"
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/40"
                />
              </label>

              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={onPlainTicket}
                  className="ux-surface-soft flex w-full items-center gap-3 rounded-[18px] border border-dashed px-4 py-3 text-left transition hover:border-white/[0.2] hover:bg-white/[0.04]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold text-white">Общий вопрос, без релиза</span>
                    <span className="block text-[12.5px] text-white/45">Как пройти модерацию, сроки, требования</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/35" />
                </button>
                {releasesError ? (
                  <div className="ux-error flex items-center justify-between gap-3 rounded-[18px] px-4 py-3 text-sm text-rose-100">
                    <span>{releasesError}</span>
                    <button
                      type="button"
                      onClick={onReloadReleases}
                      className="ux-control-compact inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      Повторить
                    </button>
                  </div>
                ) : releases === null ? (
                  <div className="ux-loading flex items-center gap-2 rounded-[18px] px-4 py-4 text-[14px] text-white/65">
                    <Loader2 className="h-4 w-4 animate-spin text-[#a78bfa]" />
                    Загружаем релизы...
                  </div>
                ) : releases.length === 0 ? (
                  <div className="ux-empty rounded-[18px] border-dashed px-4 py-4 text-[14px] leading-6 text-white/52">
                    Принятых релизов пока нет.{" "}
                    <button
                      type="button"
                      onClick={onPlainTicket}
                      className="font-semibold text-[#c4b5fd] hover:text-white"
                    >
                      Написать обычное обращение
                    </button>
                  </div>
                ) : (
                  (["accepted", "moderation"] as const).map((group) => (
                    <ReleaseGroup
                      key={group}
                      title={group === "accepted" ? "Принятые" : "На модерации"}
                      releases={visible.filter((release) => release.group === group)}
                      // While searching, every group with matches is open.
                      open={query ? true : openGroups[group]}
                      onToggle={() =>
                        setOpenGroups((prev) => ({
                          ...prev,
                          [group]: !prev[group]
                        }))
                      }
                      selectedId={releaseId}
                      onSelect={(id) => {
                        setReleaseId(id);
                        goTo(1);
                      }}
                    />
                  ))
                )}
                {releases && releases.length > 0 && query && visible.length === 0 ? (
                  <div className="ux-empty rounded-[18px] border-dashed px-4 py-4 text-[14px] text-white/52">
                    Ничего не нашлось.
                  </div>
                ) : null}
              </div>
            </div>
          ) : step === 1 ? (
            <div className="grid gap-2">
              {SUPPORT_RELEASE_REQUEST_TYPES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setRequestType(item.id);
                    goTo(2);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-[18px] border px-4 py-3.5 text-left transition",
                    requestType === item.id
                      ? "ux-pill-active border-[#7b61ff]/50 text-white"
                      : "ux-surface-soft text-white/74 hover:border-white/[0.14] hover:bg-white/[0.055] hover:text-white"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-white">{item.title}</span>
                    <span className="block text-[13px] text-white/45">{item.hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/35" />
                </button>
              ))}
            </div>
          ) : type ? (
            <div className="grid gap-5">
              {type.needsPlatforms ? (
                <section>
                  <Label>{type.id === "missing_on_store" ? "Где нет релиза" : "Площадки"}</Label>
                  <div className="flex flex-wrap gap-2">
                    {SUPPORT_RELEASE_PLATFORMS.map((platform) => {
                      const on = platforms.includes(platform);
                      return (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => {
                            setPlatforms((prev) =>
                              on ? prev.filter((item) => item !== platform) : [...prev, platform]
                            );
                            if (!on) setJustAdded(platform);
                          }}
                          className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition",
                            on
                              ? "border-[#7b61ff] bg-[#7b61ff] text-white"
                              : "border-white/[0.1] bg-white/[0.03] text-white/70 hover:border-white/[0.2] hover:text-white"
                          )}
                        >
                          {on ? <Check className="h-3.5 w-3.5" /> : null}
                          {platform}
                        </button>
                      );
                    })}
                  </div>
                  {needsLinks && platforms.length === 0 ? (
                    <p className="mt-2 text-[12.5px] text-white/45">
                      Отметьте площадки — для каждой появятся поля для ссылок.
                    </p>
                  ) : null}
                </section>
              ) : null}

              {needsLinks && platforms.length > 0 ? (
                <section className="grid gap-3">
                  <Label>Ссылки по площадкам</Label>
                  {platforms.map((platform) => {
                    const hint = SUPPORT_PLATFORM_LINK_HINTS[platform];
                    const value = links[platform] ?? { card: "", releases: "" };
                    return (
                      <div
                        key={platform}
                        ref={(node) => {
                          if (node) blockRefs.current.set(platform, node);
                          else blockRefs.current.delete(platform);
                        }}
                        className="ux-surface-soft scroll-mb-4 rounded-[20px] border p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[14.5px] font-semibold text-white">{platform}</p>
                          <button
                            type="button"
                            onClick={() => setPlatforms((prev) => prev.filter((item) => item !== platform))}
                            className="inline-flex h-8 items-center gap-1 rounded-full border border-rose-400/30 bg-rose-500/10 px-3 text-[12.5px] font-semibold text-rose-300 transition hover:border-rose-400/50 hover:bg-rose-500/20 hover:text-rose-200"
                          >
                            <X className="h-3.5 w-3.5" />
                            Убрать
                          </button>
                        </div>
                        <div className="mt-3 grid gap-3">
                          {type.needsCardUrl ? (
                            <label className="block">
                              <span className="mb-1.5 block text-[12.5px] text-white/50">
                                {type.id === "remove_from_card"
                                  ? "Карточка, где лишний релиз"
                                  : "Нужная карточка артиста"}
                              </span>
                              <input
                                value={value.card}
                                onChange={(event) => setPlatformLink(platform, "card", event.target.value)}
                                placeholder={hint.card}
                                className={inputClass}
                              />
                            </label>
                          ) : null}
                          {type.needsReleaseUrls ? (
                            <label className="block">
                              <span className="mb-1.5 block text-[12.5px] text-white/50">
                                {type.id === "remove_from_card"
                                  ? "Релизы, которые нужно убрать"
                                  : "Ссылка на релиз (если есть)"}
                              </span>
                              <textarea
                                value={value.releases}
                                onChange={(event) => setPlatformLink(platform, "releases", event.target.value)}
                                placeholder={`${hint.release}\nПо одной ссылке на строку`}
                                rows={2}
                                className={cn(textareaClass, "min-h-[76px]")}
                              />
                            </label>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </section>
              ) : null}

              <section>
                <Label>{type.id === "other" ? "Ваш вопрос" : "Комментарий (необязательно)"}</Label>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={type.id === "other" ? "Опишите вопрос максимально подробно" : "Что ещё важно знать"}
                  rows={type.id === "other" ? 5 : 2}
                  className={cn(textareaClass, type.id === "other" ? "min-h-[140px]" : "min-h-[76px]")}
                />
              </section>
            </div>
          ) : null}
        </div>
      </div>

      {/* Pinned footer: the buttons stay put while the cards above scroll. */}
      <div className="border-t border-white/[0.08] px-5 py-4 sm:px-6">
        {fieldError ? (
          <p className="mb-3 text-[13.5px] font-medium text-rose-300" role="alert">
            {fieldError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {step === 2 ? (
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="ux-button-primary inline-flex h-11 items-center rounded-[18px] px-5 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saving ? "Создаём..." : "Отправить заявку"}
            </button>
          ) : null}
          {step > 0 ? (
            <button
              type="button"
              onClick={() => goTo((step - 1) as Step)}
              className="ux-control-compact inline-flex h-11 items-center gap-1.5 rounded-[18px] px-4 text-[15px] font-semibold text-white/78 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center rounded-[18px] px-3 text-[15px] font-semibold text-white/55 transition hover:text-white"
          >
            Отмена
          </button>
          {step > 0 ? (
            <span className="ml-auto text-[13px] text-white/45">
              Вопрос не про релиз?{" "}
              <button type="button" onClick={onPlainTicket} className="font-semibold text-[#c4b5fd] hover:text-white">
                Обычное обращение
              </button>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stepper({
  step,
  canOpen,
  onOpen
}: {
  step: Step;
  canOpen: (index: number) => boolean;
  onOpen: (step: Step) => void;
}) {
  return (
    <ol className="flex items-center gap-1.5">
      {STEPS.map((label, index) => {
        const done = index < step;
        const current = index === step;
        return (
          <li key={label} className="flex items-center gap-1.5">
            {index > 0 ? <span className="h-px w-4 bg-white/[0.12]" /> : null}
            <button
              type="button"
              disabled={!canOpen(index) || current}
              onClick={() => onOpen(index as Step)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold transition",
                current && "bg-[#7b61ff]/18 text-[#d8ccff]",
                done && "text-white/70 hover:text-white",
                !current && !done && "text-white/35"
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 place-items-center rounded-full text-[11px]",
                  current ? "bg-[#7b61ff] text-white" : done ? "bg-emerald-500/20 text-emerald-300" : "bg-white/[0.06]"
                )}
              >
                {done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function SummaryChip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Изменить"
      className="inline-flex h-9 items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] pl-1.5 pr-3 text-[13px] font-semibold text-white/85 transition hover:border-white/[0.2] hover:text-white"
    >
      {children}
      <span className="text-[12px] font-medium text-[#c4b5fd]">Изменить</span>
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44">{children}</span>
  );
}

function ReleaseGroup({
  title,
  releases,
  open,
  onToggle,
  selectedId,
  onSelect
}: {
  title: string;
  releases: SupportReleaseOption[];
  open: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (releases.length === 0) return null;
  return (
    <div className="ux-surface-soft overflow-hidden rounded-[18px] border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
      >
        <span className="text-[14.5px] font-semibold text-white">
          {title} <span className="text-white/40">{releases.length}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-white/45 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ul className="max-h-[320px] divide-y divide-white/[0.06] overflow-y-auto border-t border-white/[0.06]">
          {releases.map((release) => {
            const selected = release.id === selectedId;
            return (
              <li key={release.id}>
                <button
                  type="button"
                  onClick={() => onSelect(release.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
                    selected ? "bg-[#7b61ff]/14" : "hover:bg-white/[0.04]"
                  )}
                >
                  <SupportReleaseCover src={release.coverUrl} className="h-10 w-10" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-white">{release.title}</span>
                    <span className="block truncate text-[12px] text-white/50">
                      {release.artist ? `${release.artist} · ` : ""}
                      {release.upc ? `UPC ${release.upc}` : "UPC ещё не присвоен"}
                    </span>
                  </span>
                  {selected ? (
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#7b61ff] text-white">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
