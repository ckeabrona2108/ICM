"use client";

import * as React from "react";
import { AlertTriangle, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  RELEASE_CHANGE_AREAS,
  RELEASE_CHANGE_AREA_LABELS,
  changedReleaseAreas,
  diffReleaseSubmissions,
  unmarkedReleaseChangeAreas,
  type ReleaseChangeArea
} from "@/lib/release-copy-changes";
import type { ReleaseSubmissionData } from "@/lib/release-policy";

import { buildReleaseSubmissionData } from "./release-submission";
import { useWizard } from "./wizard-context";

const cardClass =
  "rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,21,34,0.96),rgba(11,14,25,0.98))] p-5 sm:p-6";

/** First step when editing an approved release: what changes and why. */
export function StepChanges() {
  const { data, set } = useWizard();
  const request = data.changeRequest;
  if (!request) return null;

  const toggle = (area: ReleaseChangeArea) => {
    const areas = request.areas.includes(area)
      ? request.areas.filter((item) => item !== area)
      : RELEASE_CHANGE_AREAS.filter((item) => item === area || request.areas.includes(item));
    set("changeRequest", { ...request, areas });
  };

  return (
    <section id="wizard-change-request" className={cardClass}>
      <p className="max-w-3xl text-[13px] leading-6 text-white/60">
        Отметьте всё, что меняете. Дальше откроются только нужные экраны, а модератор проверит именно эти
        изменения. «Другое» открывает полное редактирование релиза.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {RELEASE_CHANGE_AREAS.map((area) => {
          const checked = request.areas.includes(area);
          return (
            <button
              key={area}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => toggle(area)}
              className={cn(
                "flex items-center gap-3 rounded-[16px] border px-4 py-3 text-left text-[14px] transition-colors",
                checked
                  ? "border-[var(--ux-accent)]/60 bg-[var(--ux-accent)]/[0.12] text-white"
                  : "border-white/[0.10] bg-black/20 text-white/80 hover:border-white/[0.2]"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                  checked ? "border-[var(--ux-accent)] bg-[var(--ux-accent)] text-black" : "border-white/30"
                )}
              >
                {checked ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
              {RELEASE_CHANGE_AREA_LABELS[area]}
            </button>
          );
        })}
      </div>
      <label className="mt-5 block text-[13px] font-medium text-white/75" htmlFor="wizard-change-request-comment">
        Зачем нужны изменения
      </label>
      <textarea
        id="wizard-change-request-comment"
        value={request.comment}
        onChange={(event) => set("changeRequest", { ...request, comment: event.target.value })}
        placeholder="Заменил обложку: на старой была ошибка в имени артиста"
        className="mt-2 min-h-[96px] w-full rounded-[20px] border border-white/[0.10] bg-black/20 px-4 py-3 text-[14px] text-white outline-none transition-colors placeholder:text-white/32 focus:border-[var(--ux-accent)]/50"
      />
    </section>
  );
}

/** Review step: what actually differs from the published version, checked against the marks. */
export function CopyChangesReview({ original }: { original: ReleaseSubmissionData }) {
  const { data, setStep } = useWizard();
  const current = React.useMemo(() => buildReleaseSubmissionData(data), [data]);
  const changes = React.useMemo(() => diffReleaseSubmissions(original, current), [original, current]);
  const request = data.changeRequest;
  const changed = changedReleaseAreas(changes);
  const unmarked = unmarkedReleaseChangeAreas(changes, request);
  const markedButSame = (request?.areas ?? []).filter((area) => area !== "other" && !changed.includes(area));

  return (
    <section className={cardClass}>
      <h3 className="text-[20px] font-semibold text-white">Изменения относительно опубликованного релиза</h3>
      {request?.comment ? (
        <p className="mt-2 text-[13px] leading-6 text-white/60">Ваш комментарий: {request.comment}</p>
      ) : null}
      {changes.length === 0 ? (
        <p className="mt-4 rounded-[16px] border border-amber-400/25 bg-amber-500/[0.07] px-4 py-3 text-[13px] text-amber-100/90">
          Пока ничего не изменено: релиз совпадает с опубликованной версией.
        </p>
      ) : (
        <ul className="mt-4 space-y-2 text-[14px]">
          {changed.map((area) => {
            const isMarked = !unmarked.includes(area);
            const items = changes.filter((change) => change.area === area);
            return (
              <li
                key={area}
                className={cn(
                  "rounded-[16px] border px-4 py-3",
                  isMarked ? "border-emerald-400/20 bg-emerald-500/[0.06]" : "border-amber-400/30 bg-amber-500/[0.08]"
                )}
              >
                <div className={cn("flex items-center gap-2 font-medium", isMarked ? "text-emerald-100" : "text-amber-100")}>
                  {isMarked ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {RELEASE_CHANGE_AREA_LABELS[area]}
                  {isMarked ? null : <span className="font-normal">— изменено, но не отмечено</span>}
                </div>
                <p className="mt-1 text-[12.5px] leading-5 text-white/55">
                  {items.map((item) => item.label).join(", ")}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {markedButSame.length > 0 ? (
        <p className="mt-3 text-[12.5px] leading-5 text-white/55">
          Отмечено, но не изменено: {markedButSame.map((area) => RELEASE_CHANGE_AREA_LABELS[area]).join(", ")}.
        </p>
      ) : null}
      {unmarked.length > 0 ? (
        <button
          type="button"
          onClick={() => setStep("changes")}
          className="mt-4 rounded-lg border border-white/[0.12] px-3 py-1.5 text-[12.5px] text-white/80 transition-colors hover:border-white/[0.24] hover:text-white"
        >
          Отметить изменения
        </button>
      ) : null}
    </section>
  );
}

/** Lyrics-only edit of an approved release: one text field per track. */
export function StepLyrics() {
  const { data, updateTracks } = useWizard();
  return (
    <section className={cardClass}>
      <p className="max-w-3xl text-[13px] leading-6 text-white/60">
        Добавьте или исправьте тексты. Аудио и остальные данные треков не меняются.
      </p>
      <div className="mt-4 space-y-5">
        {data.tracks.map((track, index) => (
          <div key={track.id}>
            <label htmlFor={`wizard-lyrics-${track.id}`} className="block text-[14px] font-medium text-white/85">
              {index + 1}. {track.meta.title || track.name}
            </label>
            <textarea
              id={`wizard-lyrics-${track.id}`}
              value={track.meta.lyrics}
              onChange={(event) => {
                const lyrics = event.target.value;
                updateTracks((tracks) =>
                  tracks.map((item) => (item.id === track.id ? { ...item, meta: { ...item.meta, lyrics } } : item))
                );
              }}
              placeholder="Текст песни"
              className="mt-2 min-h-[180px] w-full rounded-[20px] border border-white/[0.10] bg-black/20 px-4 py-3 text-[14px] leading-6 text-white outline-none transition-colors placeholder:text-white/32 focus:border-[var(--ux-accent)]/50"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
