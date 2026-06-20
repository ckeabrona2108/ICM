"use client";

import * as React from "react";
import { Info, Plus, Trash2 } from "lucide-react";

import { LANGUAGES } from "@/lib/countries";
import { trackPersonRoleOptions } from "@/lib/person-roles";
import {
  getFocusTrackLimit,
  getTrackAuthorCoverage
} from "@/lib/release-policy";

import { useWizard, type PersonRole, type TrackMeta } from "./wizard-context";
import { Checkbox, FieldLabel, Select, TextArea, TextInput } from "./wizard-ui";

const TRACK_LANGUAGE_OPTIONS = [...LANGUAGES, "Без слов"];
type TrackAssetKind = "syncedLyrics" | "ringtone" | "video";
type AiTrackField =
  | "aiGeneratedFullTrack"
  | "aiGeneratedMusicOnly"
  | "aiGeneratedLyricsOnly"
  | "aiProcessedTrackOnly";

function normalizePercentInput(raw: string): string {
  const cleaned = raw.replace(",", ".").replace(/[^\d.]/gu, "");
  if (!cleaned) return "";
  const [intPart, ...rest] = cleaned.split(".");
  const joined = rest.length > 0 ? `${intPart}.${rest.join("")}` : intPart;
  const numeric = Number(joined);
  if (!Number.isFinite(numeric)) return "";
  if (numeric < 0) return "0";
  if (numeric > 100) return "100";
  return joined;
}

export function TrackMetaForm({
  meta,
  fileName,
  hasAudio,
  onPatch,
  uploadingAssetKind,
  onUploadAsset,
  onRemoveAsset
}: {
  meta: TrackMeta;
  fileName: string;
  hasAudio: boolean;
  onPatch: (patch: Partial<TrackMeta>) => void;
  uploadingAssetKind: TrackAssetKind | null;
  onUploadAsset: (kind: TrackAssetKind, file: File) => void;
  onRemoveAsset: (kind: TrackAssetKind) => void;
}) {
  const [rightsError, setRightsError] = React.useState<string | null>(null);

  const setAiAssistanceUsed = (checked: boolean) => {
    onPatch({
      aiAssistanceUsed: checked,
      ...(checked
        ? {}
        : {
            aiGeneratedFullTrack: false,
            aiGeneratedMusicOnly: false,
            aiGeneratedLyricsOnly: false,
            aiProcessedTrackOnly: false
          })
    });
  };

  const setAiField = (field: AiTrackField, checked: boolean) => {
    onPatch({
      aiAssistanceUsed: checked ? true : meta.aiAssistanceUsed,
      [field]: checked
    } as Partial<TrackMeta>);
  };

  const setCopyrightPct = (value: string) => {
    const normalized = normalizePercentInput(value);
    if (value.trim() && normalized === "100" && Number(value.replace(",", ".")) > 100) {
      setRightsError("Доля не может быть больше 100%");
    } else {
      setRightsError(null);
    }
    onPatch({ copyrightPct: normalized });
  };

  const setRelatedRightsPct = (value: string) => {
    const normalized = normalizePercentInput(value);
    if (value.trim() && normalized === "100" && Number(value.replace(",", ".")) > 100) {
      setRightsError("Доля не может быть больше 100%");
    } else {
      setRightsError(null);
    }
    onPatch({ relatedRightsPct: normalized });
  };

  const addPerson = () =>
    onPatch({
      trackPersons: [
        ...meta.trackPersons,
        { id: crypto.randomUUID(), name: "", role: "" }
      ]
    });

  const updatePerson = (id: string, field: keyof Pick<PersonRole, "name" | "role">, value: string) =>
    onPatch({
      trackPersons: meta.trackPersons.map((p) =>
        p.id === id ? { ...p, [field]: value } : p
      )
    });

  const removePerson = (id: string) =>
    onPatch({ trackPersons: meta.trackPersons.filter((p) => p.id !== id) });

  const canAddPerson = meta.trackPersons.every(
    (person) => person.name.trim().length > 0 && person.role.trim().length > 0
  );
  const authorCoverage = getTrackAuthorCoverage(meta.trackPersons);
  const hasRequiredAuthors =
    authorCoverage.hasMusicAuthor && authorCoverage.hasLyricsAuthor;

  const { data: wizardData } = useWizard();

  const focusLimit = getFocusTrackLimit({
    releaseType: wizardData.type,
    releaseKind: wizardData.releaseKind,
    trackCount: wizardData.tracks.length
  });

  const focusSelectedCount = wizardData.tracks.filter((track) => track.meta.focusTrack).length;
  const focusDisabled = !meta.focusTrack && (focusLimit === 0 || focusSelectedCount >= focusLimit);

  return (
    <div className="space-y-4 border-t border-white/[0.06] pt-4">
      <p className="text-[11px] text-white/40">
        Файл: <span className="text-white/70">{fileName}</span>
      </p>

      {!hasAudio ? (
        <p className="rounded-lg border border-indigo-400/25 bg-indigo-500/10 px-3 py-2 text-[12px] text-indigo-100/95">
          Трек создан без аудиофайла. Для отправки релиза уберите стриминговые площадки или загрузите аудио.
        </p>
      ) : null}

      <div className="space-y-5">
              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel required hint="Как трек будет отображаться на площадках">
                      Название трека
                    </FieldLabel>
                    <TextInput
                      value={meta.title}
                      onChange={(e) => onPatch({ title: e.target.value })}
                      placeholder="Введите название трека"
                    />
                  </div>
                  <div>
                    <FieldLabel hint="Необязательно">Подзаголовок</FieldLabel>
                    <TextInput
                      value={meta.subtitle}
                      onChange={(e) => onPatch({ subtitle: e.target.value })}
                      placeholder="Введите подзаголовок"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 space-y-3">
                <h4 className="text-[13px] font-semibold text-white">Идентификация</h4>
                <p className="text-[11px] text-white/40">
                  Если ISRC отсутствует, система присвоит код после модерации.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>ISRC</FieldLabel>
                    <TextInput
                      value={meta.isrc}
                      onChange={(e) => onPatch({ isrc: e.target.value })}
                      placeholder="CCXXXYYNNNNN"
                    />
                  </div>
                  <div>
                    <FieldLabel>Код партнёра</FieldLabel>
                    <TextInput
                      value={meta.partnerCode}
                      onChange={(e) => onPatch({ partnerCode: e.target.value })}
                      placeholder="Внутренний код"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 space-y-3">
                <h4 className="text-[13px] font-semibold text-white">Персоны и роли</h4>
                <p className="text-[11px] text-white/45">
                  Для Исполнителей, Соисполнителей (feat.), Remixer указывайте псевдоним артиста. Для ролей «Автор музыки» и «Автор слов» — фактические имя и фамилию.
                </p>
                <div className="space-y-2">
                  {meta.trackPersons.map((p) => (
                    <div key={p.id} className="grid gap-2 sm:grid-cols-[1fr_170px_auto]">
                      <TextInput
                        placeholder="Псевдоним / имя"
                        value={p.name}
                        onChange={(e) => updatePerson(p.id, "name", e.target.value)}
                      />
                      <Select
                        value={p.role}
                        onChange={(v) => updatePerson(p.id, "role", v)}
                        options={trackPersonRoleOptions}
                        placeholder="Роль"
                      />
                      <button
                        type="button"
                        onClick={() => removePerson(p.id)}
                        className="grid h-10 w-10 place-items-center rounded-lg border border-white/[0.08] text-white/55 transition-colors hover:border-[#ff5d6d]/40 hover:text-[#ff5d6d]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addPerson}
                  disabled={!canAddPerson}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors ${
                    canAddPerson
                      ? "border-white/[0.08] bg-white/[0.03] text-white/85 hover:border-white/[0.16] hover:bg-white/[0.06]"
                      : "cursor-not-allowed border-white/[0.05] bg-white/[0.02] text-white/35"
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Добавить персону
                </button>
                {!hasRequiredAuthors ? (
                  <p className="text-[11px] text-rose-300">
                    Добавьте автора музыки и автора слов для этого трека.
                  </p>
                ) : null}
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 space-y-3">
                <h4 className="text-[13px] font-semibold text-white">Права</h4>
                <p className="text-[11px] text-white/40">
                  Значение доли должно быть в диапазоне от 0 до 100.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel required hint="Авторские права (©)">© Доля, %</FieldLabel>
                    <TextInput
                      inputMode="decimal"
                      value={meta.copyrightPct}
                      onChange={(e) => setCopyrightPct(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <FieldLabel required hint="Смежные права (℗)">℗ Доля, %</FieldLabel>
                    <TextInput
                      inputMode="decimal"
                      value={meta.relatedRightsPct}
                      onChange={(e) => setRelatedRightsPct(e.target.value)}
                      placeholder="100"
                    />
                  </div>
                </div>
                {rightsError ? (
                  <p className="text-[11px] text-rose-300">{rightsError}</p>
                ) : null}
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 space-y-3">
                <h4 className="text-[13px] font-semibold text-white">Дополнительные параметры</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel hint="Секунда начала превью на витрине">Начало предпрослушивания</FieldLabel>
                    <TextInput
                      value={meta.previewStart}
                      onChange={(e) => onPatch({ previewStart: e.target.value })}
                      placeholder="MM:SS"
                      className="font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <FieldLabel hint="Если добавляете рингтон, укажите длительность">Рингтон, сек</FieldLabel>
                    <TextInput
                      value={meta.ringtoneDurationSec}
                      onChange={(e) => onPatch({ ringtoneDurationSec: e.target.value })}
                      placeholder="5 - 29.99"
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Checkbox
                    checked={meta.instantGratification}
                    onChange={(v) => onPatch({ instantGratification: v })}
                    label="Instant Gratification"
                    description="До 50% треков релиза"
                    size="sm"
                  />

                  <Checkbox
                    checked={meta.focusTrack}
                    onChange={(v) => {
                      if (!v || !focusDisabled) {
                        onPatch({ focusTrack: v });
                      }
                    }}
                    label="Focus track"
                    description={
                      focusLimit === 0
                        ? "Недоступно для текущего типа/вида релиза"
                        : `Доступно: ${focusLimit}, выбрано: ${focusSelectedCount}`
                    }
                    size="sm"
                  />
                </div>

                {focusDisabled && !meta.focusTrack ? (
                  <p className="text-[11px] text-amber-200/90">
                    Лимит Focus track уже исчерпан или опция недоступна для выбранного релиза.
                  </p>
                ) : null}
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 space-y-3">
                <h4 className="text-[13px] font-semibold text-white">Использование ИИ</h4>
                <Checkbox
                  checked={meta.aiAssistanceUsed}
                  onChange={setAiAssistanceUsed}
                  label="Использование ИИ"
                  description="Отметьте, если при создании трека использовался искусственный интеллект"
                  size="sm"
                />
                <div className="grid gap-2 border-l border-white/[0.08] pl-6 sm:grid-cols-2">
                  <Checkbox
                    checked={meta.aiGeneratedFullTrack}
                    onChange={(v) => setAiField("aiGeneratedFullTrack", v)}
                    label="Трек полностью сгенерирован ИИ (Текст + Музыка)"
                    size="sm"
                  />
                  <Checkbox
                    checked={meta.aiGeneratedMusicOnly}
                    onChange={(v) => setAiField("aiGeneratedMusicOnly", v)}
                    label="ИИ использован частично, только для генерации музыки"
                    size="sm"
                  />
                  <Checkbox
                    checked={meta.aiGeneratedLyricsOnly}
                    onChange={(v) => setAiField("aiGeneratedLyricsOnly", v)}
                    label="ИИ использован частично, только для генерации текста"
                    size="sm"
                  />
                  <Checkbox
                    checked={meta.aiProcessedTrackOnly}
                    onChange={(v) => setAiField("aiProcessedTrackOnly", v)}
                    label="ИИ использован частично, только для обработки трека"
                    size="sm"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 space-y-3">
                <h4 className="text-[13px] font-semibold text-white">Версия трека</h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Checkbox
                    checked={meta.versionExplicit}
                    onChange={(v) => onPatch({ versionExplicit: v })}
                    label="Explicit"
                    size="sm"
                  />
                  <Checkbox
                    checked={meta.versionLive}
                    onChange={(v) => onPatch({ versionLive: v })}
                    label="Live"
                    size="sm"
                  />
                  <Checkbox
                    checked={meta.versionCover}
                    onChange={(v) => onPatch({ versionCover: v })}
                    label="Cover"
                    size="sm"
                  />
                  <Checkbox
                    checked={meta.versionRemix}
                    onChange={(v) => onPatch({ versionRemix: v })}
                    label="Remix"
                    size="sm"
                  />
                  <Checkbox
                    checked={meta.versionInstrumental}
                    onChange={(v) => onPatch({ versionInstrumental: v })}
                    label="Instrumental"
                    size="sm"
                  />
                  <Checkbox
                    checked={meta.versionDrugReference}
                    onChange={(v) => onPatch({ versionDrugReference: v })}
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        <span>Упоминание наркотических/психотропных веществ</span>
                        <InlineTooltip text="Отметка поставлена в целях информирования и соблюдения норм закона. В соответствии с требованиями Федерального закона от 08.08.2024 № 224-ФЗ, если трек содержит упоминания, которые могут быть интерпретированы как связанные с наркотическими средствами или психотропными веществами, отметьте этот пункт." />
                      </span>
                    }
                    size="sm"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 space-y-3">
                <h4 className="text-[13px] font-semibold text-white">Виды использования</h4>
                <div>
                  <FieldLabel required>Язык трека</FieldLabel>
                  <Select
                    value={meta.metadataLanguage}
                    onChange={(v) => onPatch({ metadataLanguage: v })}
                    options={TRACK_LANGUAGE_OPTIONS}
                    placeholder="Выберите язык"
                  />
                </div>
                {hasAudio ? (
                  <div>
                    <FieldLabel hint="Укажите текст трека дословно, как исполняется">
                      Текст трека
                    </FieldLabel>
                    <TextArea
                      value={meta.lyrics}
                      onChange={(e) => onPatch({ lyrics: e.target.value })}
                      placeholder="Введите текст трека"
                      className="min-h-[120px]"
                    />
                  </div>
                ) : null}
                <div className="grid gap-3 pt-1 lg:grid-cols-3">
                  <TrackAssetUploadCard
                    title="Синхронизированный текст трека"
                    hint="Формат: .ttml"
                    kind="syncedLyrics"
                    fileName={meta.syncedLyricsFile?.fileName ?? null}
                    uploading={uploadingAssetKind === "syncedLyrics"}
                    onUploadAsset={onUploadAsset}
                    onRemoveAsset={onRemoveAsset}
                  />
                  <TrackAssetUploadCard
                    title="Добавление рингтона"
                    hint="Форматы: .wav, .flac"
                    kind="ringtone"
                    fileName={meta.ringtoneFile?.fileName ?? null}
                    uploading={uploadingAssetKind === "ringtone"}
                    onUploadAsset={onUploadAsset}
                    onRemoveAsset={onRemoveAsset}
                  />
                  <TrackAssetUploadCard
                    title="Загрузка видео"
                    hint="Форматы: .mov, .mp4, .avi"
                    kind="video"
                    fileName={meta.videoFile?.fileName ?? null}
                    uploading={uploadingAssetKind === "video"}
                    onUploadAsset={onUploadAsset}
                    onRemoveAsset={onRemoveAsset}
                  />
                </div>
              </div>
      </div>
    </div>
  );
}

function InlineTooltip({ text }: { text: string }) {
  return (
    <span className="group/tooltip relative inline-flex items-center">
      <span className="cursor-help text-white/35 transition-colors group-hover/tooltip:text-[#7b3df5]">
        <Info className="h-3.5 w-3.5" />
      </span>
      <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 hidden w-[min(280px,calc(100vw-3rem))] rounded-xl border border-white/[0.08] bg-[#384154] px-3 py-2 text-[11px] font-medium leading-5 text-white shadow-[0_18px_48px_-24px_rgba(0,0,0,0.85)] group-hover/tooltip:block">
        {text}
      </span>
    </span>
  );
}

function TrackAssetUploadCard({
  title,
  hint,
  kind,
  fileName,
  uploading,
  onUploadAsset,
  onRemoveAsset
}: {
  title: string;
  hint: string;
  kind: TrackAssetKind;
  fileName: string | null;
  uploading: boolean;
  onUploadAsset: (kind: TrackAssetKind, file: File) => void;
  onRemoveAsset: (kind: TrackAssetKind) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const accept =
    kind === "syncedLyrics"
      ? ".ttml"
      : kind === "ringtone"
        ? ".wav,.flac,audio/wav,audio/x-wav,audio/flac"
        : ".mov,.mp4,.avi,video/quicktime,video/mp4,video/x-msvideo";

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
      <p className="text-[12px] font-semibold text-white/85">{title}</p>
      <p className="mt-1 text-[11px] text-white/45">{hint}</p>

      {fileName ? (
        <p className="mt-2 truncate text-[11px] text-emerald-200/85">{fileName}</p>
      ) : (
        <p className="mt-2 text-[11px] text-white/35">Файл не загружен</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/85 transition hover:border-white/[0.2] hover:bg-white/[0.08] disabled:opacity-50"
        >
          {uploading ? "Загружаем..." : "Загрузить файл"}
        </button>
        {fileName ? (
          <button
            type="button"
            onClick={() => onRemoveAsset(kind)}
            disabled={uploading}
            className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-50"
          >
            Удалить
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUploadAsset(kind, file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
