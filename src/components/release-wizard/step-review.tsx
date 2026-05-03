"use client";

import * as React from "react";
import Image from "next/image";
import { ExternalLink, ImageIcon } from "lucide-react";

import { getReleasePlatformLabel } from "@/lib/release-platforms";
import { getTrackAuthorCoverage } from "@/lib/release-policy";
import { cn } from "@/lib/utils";

import { useWizard } from "./wizard-context";

const TYPE_LABEL = {
  single: "Single",
  ep: "EP",
  album: "Album"
} as const;

const KIND_LABEL = {
  standard: "Стандартный",
  single_maxi: "Single Maxi",
  mixtape: "Mixtape",
  audiobook: "Аудиокнига"
} as const;

export function StepReview({
  onSubmit,
  errors,
  errorsBySection,
  onJumpToSection,
  blockingErrors,
  stepIssues,
  isSubmitting,
  submitPhase = "idle"
}: {
  onSubmit: () => void | Promise<void>;
  errors: string[];
  errorsBySection: {
    release_info: string[];
    tracks: string[];
    stores: string[];
    pricing: string[];
  };
  onJumpToSection: (section: "release_info" | "tracks" | "stores" | "pricing") => void;
  blockingErrors: string[];
  stepIssues: {
    info: string[];
    tracks: string[];
    extras: string[];
  };
  isSubmitting: boolean;
  submitPhase?: "idle" | "saving" | "uploading" | "submitting";
}) {
  const { data } = useWizard();
  const hasBlockingErrors = blockingErrors.length > 0;
  const reviewErrors = hasBlockingErrors
    ? [...new Set([...blockingErrors, ...errors])]
    : errors;
  const sectionRows = [
    { id: "release_info" as const, label: "Информация по релизу" },
    { id: "tracks" as const, label: "Список треков" },
    { id: "stores" as const, label: "Площадки" },
    { id: "pricing" as const, label: "Тариф и оплата" }
  ].filter((item) => (errorsBySection[item.id] ?? []).length > 0);
  const detailBySection = React.useMemo(() => {
    const merged = {
      release_info: [...errorsBySection.release_info],
      tracks: [...errorsBySection.tracks],
      stores: [...errorsBySection.stores],
      pricing: [...errorsBySection.pricing]
    };

    for (const message of stepIssues.info) {
      if (!merged.release_info.includes(message)) {
        merged.release_info.push(message);
      }
    }
    for (const message of stepIssues.tracks) {
      if (!merged.tracks.includes(message)) {
        merged.tracks.push(message);
      }
    }
    for (const message of stepIssues.extras) {
      if (!merged.stores.includes(message)) {
        merged.stores.push(message);
      }
    }

    return merged;
  }, [errorsBySection, stepIssues]);

  const territoriesText =
    data.territoryMode === "all"
      ? "Все страны"
      : data.territoryMode === "cis"
        ? "В СНГ"
        : data.territoryMode === "exclude"
          ? `Все кроме ${data.territoryCountries.length}`
          : `${data.territoryCountries.length} стран`;

  const platformsText =
    data.platformMode === "all"
      ? "Все площадки"
      : `${data.platforms.length} площадок`;

  const platformsHint =
    data.platformMode === "selected"
      ? data.platforms.map((code) => getReleasePlatformLabel(code)).join(", ")
      : "";

  return (
    <div className="space-y-6">
      {reviewErrors.length > 0 ? (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.08] p-4">
          <p className="text-[13px] font-semibold text-rose-200">
            Релиз нельзя отправить. Исправьте ошибки в разделах:
          </p>
          {sectionRows.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {sectionRows.map((section) => (
                <div key={section.id} className="rounded-lg border border-rose-300/20 bg-black/15 p-2.5">
                  <button
                    type="button"
                    onClick={() => onJumpToSection(section.id)}
                    className="block text-left text-[12.5px] font-medium text-rose-100/95 underline-offset-2 hover:underline"
                  >
                    {section.label}: {errorsBySection[section.id].length}
                  </button>
                  {detailBySection[section.id].length > 0 ? (
                    <ul className="mt-1.5 space-y-1 text-[12px] text-rose-100/85">
                      {detailBySection[section.id].map((message, index) => (
                        <li key={`${section.id}-${index}`}>• {message}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <ul className="mt-2 space-y-1 text-[12.5px] text-rose-100/90">
              {reviewErrors.map((error, index) => (
                <li key={`${error}-${index}`}>• {error}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-white/[0.05] bg-[#13141a]/80">
        <div className="grid gap-5 p-5 sm:grid-cols-[140px_1fr] sm:p-6">
          <div className="relative aspect-square w-full max-w-[140px] overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
            {data.cover ? (
              <Image src={data.cover} alt="cover" fill sizes="140px" className="object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-white/30">
                <ImageIcon className="h-6 w-6" />
              </div>
            )}
          </div>

          <div className="relative">
            <div className="absolute right-0 top-0 text-right">
              <ValueBadge label="UPC" value={data.upc} />
              <ValueBadge label="Код партнёра" value={data.partnerCode} />
            </div>

            <h3 className={cn("text-[20px] font-semibold", data.title ? "text-white" : "text-[#ff5d6d]")}>
              {data.title || "Не указано"}
            </h3>

            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
              <Field label="Тип релиза" value={data.type ? TYPE_LABEL[data.type] : ""} />
              <Field
                label="Вид релиза"
                value={data.releaseKind ? KIND_LABEL[data.releaseKind] : ""}
              />
              <Field label="Жанр" value={data.genre} />
              <Field label="Поджанр" value={data.subgenre} fallbackOk />
              <Field label="Лейбл" value={data.label} fallbackOk />
              <Field label="Год прав" value={data.rightsYear} />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/[0.05] pt-5 sm:grid-cols-3 lg:grid-cols-5">
              <Field label="Дата предзаказа" value={data.preorderDate} />
              <Field label="Дата старта" value={data.startDate} />
              <Field label="Дата релиза" value={data.releaseDate} />
              <Field
                label="Территории"
                value={
                  <span className="inline-flex items-center gap-1 text-white/85">
                    {territoriesText}
                    <ExternalLink className="h-3 w-3 text-white/40" />
                  </span>
                }
                fallbackOk
              />
              <Field
                label="Площадки"
                value={
                  <span className="inline-flex items-center gap-1 text-white/85">
                    {platformsText}
                    <ExternalLink className="h-3 w-3 text-white/40" />
                  </span>
                }
                fallbackOk
              />
            </div>

            {platformsHint ? (
              <p className="mt-2 text-[11px] text-white/50">{platformsHint}</p>
            ) : null}

            <div className="mt-5 border-t border-white/[0.05] pt-4">
              <span className="text-[12px] text-white/45">Персоны: </span>
              {data.persons.length === 0 ? (
                <span className="text-[12.5px] text-[#ff5d6d]">Не указано</span>
              ) : (
                <span className="text-[12.5px] text-white/85">
                  {data.persons.map((p) => `${p.name || "—"}${p.role ? ` (${p.role})` : ""}`).join(", ")}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {data.tracks.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-white/[0.05] bg-[#13141a]/80 p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold text-white">Треки ({data.tracks.length})</h3>
          <ul className="mt-4 space-y-3">
            {data.tracks.map((t, i) => {
              const title = t.meta.title.trim() || t.name;
              const personsOk =
                t.meta.trackPersons.length > 0 &&
                t.meta.trackPersons.every((p) => p.name.trim() && p.role);
              const authorCoverage = getTrackAuthorCoverage(t.meta.trackPersons);
              const authorsOk =
                authorCoverage.hasMusicAuthor && authorCoverage.hasLyricsAuthor;
              const langOk = Boolean(t.meta.metadataLanguage.trim());
              return (
                <li
                  key={t.id}
                  className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-[12px] text-white/40">
                      {String(i + 1).padStart(2, "0")} · {t.name}
                      {!t.hasAudio ? " · без аудио" : ""}
                    </p>
                    <p
                      className={cn(
                        "truncate text-[14px] font-medium",
                        t.meta.title.trim() ? "text-white" : "text-[#ff5d6d]"
                      )}
                    >
                      {title}
                    </p>
                    {t.meta.isrc.trim() ? (
                      <p className="mt-1 text-[11px] text-white/45">ISRC: {t.meta.isrc}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 text-[11px]">
                    {!langOk ? (
                      <span className="rounded-md bg-amber-500/15 px-2 py-1 text-amber-200/90">
                        Нет языка трека
                      </span>
                    ) : null}
                    {!personsOk ? (
                      <span className="rounded-md bg-amber-500/15 px-2 py-1 text-amber-200/90">
                        Персоны
                      </span>
                    ) : null}
                    {!authorsOk ? (
                      <span className="rounded-md bg-rose-500/15 px-2 py-1 text-rose-200/90">
                        Нет авторов
                      </span>
                    ) : null}
                    {langOk && personsOk && authorsOk ? (
                      <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-emerald-200/90">
                        Метаданные заполнены
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting || hasBlockingErrors}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl bg-[#7b3df5] px-6 py-3 text-[14px] font-semibold text-white shadow-[0_8px_28px_-8px_rgba(123,61,245,0.55)] transition-all hover:-translate-y-0.5 hover:bg-[#8b4ff7] hover:shadow-[0_12px_32px_-8px_rgba(123,61,245,0.7)] active:translate-y-0",
            (isSubmitting || hasBlockingErrors) &&
              "cursor-not-allowed opacity-75 hover:translate-y-0"
          )}
        >
          {submitPhase === "saving"
            ? "Сохраняем изменения..."
            : submitPhase === "uploading"
              ? "Загружаем файлы..."
            : submitPhase === "submitting" || isSubmitting
              ? "Отправляем на модерацию..."
              : "Отправить релиз на модерацию"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  fallbackOk
}: {
  label: string;
  value: React.ReactNode;
  fallbackOk?: boolean;
}) {
  const empty = !value || (typeof value === "string" && value.trim() === "");
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-white/40">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-[12.5px]",
          empty
            ? fallbackOk
              ? "text-white/85"
              : "text-[#ff5d6d]"
            : "text-white/85"
        )}
      >
        {empty ? "Не указано" : value}
      </p>
    </div>
  );
}

function ValueBadge({ label, value }: { label: string; value: string }) {
  const empty = !value || value.trim() === "";
  return (
    <p className={cn("text-[11px]", empty ? "text-[#ff5d6d]" : "text-white/75")}>{label}: {empty ? "—" : value}</p>
  );
}
