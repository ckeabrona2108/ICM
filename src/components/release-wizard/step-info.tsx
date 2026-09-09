"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
  Upload
} from "lucide-react";

import { buildCoverImageSrcCandidates } from "@/lib/image-src";
import { cn } from "@/lib/utils";
import { CIS_CODES, COUNTRIES, GENRES, LANGUAGES, flagEmoji } from "@/lib/countries";
import { releasePersonRoleOptions } from "@/lib/person-roles";
import {
  releasePlatformDefinitions
} from "@/lib/release-platforms";

import { useWizard } from "./wizard-context";
import {
  DateInput,
  FieldLabel,
  Select,
  TextInput,
  WizardCard
} from "./wizard-ui";

function resolvePartnerCodeErrorMessage(params: {
  status: number;
  payload: { error?: string; message?: string } | null;
}): string {
  if (params.payload?.message?.trim()) {
    return params.payload.message.trim();
  }

  if (params.status === 401) {
    return "Войдите в аккаунт, чтобы проверить партнёрский код.";
  }

  if (params.status === 403) {
    return "У вас нет доступа к проверке партнёрского кода.";
  }

  if (params.payload?.error?.trim()) {
    return params.payload.error.trim();
  }

  return "Партнёрский код недействителен.";
}

const COVER_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const COVER_MIN_SIZE_PX = 1400;
const COVER_MAX_SIZE_PX = 6000;
const COVER_ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const PLATFORM_PREVIEW_LIMIT = 12;
const COUNTRY_PREVIEW_LIMIT = 24;

function CodesFieldLabel({
  children,
  required
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase leading-none tracking-[0.06em] text-white/50">
      <span className="min-w-0 truncate">{children}</span>
      {required ? <span className="shrink-0 text-[var(--ux-accent)]">*</span> : null}
    </label>
  );
}

async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = new window.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("load_failed"));
      image.src = objectUrl;
    });

    return { width: image.width, height: image.height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function readAsDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export function StepInfo({
  section = "basics"
}: {
  section?: "basics" | "persons" | "codes" | "stores";
}) {
  const { data, set, patch } = useWizard();
  const [coverError, setCoverError] = React.useState<string | null>(null);
  const [coverCandidateIndex, setCoverCandidateIndex] = React.useState(0);
  const [partnerCodeState, setPartnerCodeState] = React.useState<{
    status: "idle" | "loading" | "valid" | "invalid";
    message: string | null;
    validatedCode: string;
  }>({
    status: "idle",
    message: null,
    validatedCode: ""
  });
  const coverCandidates = React.useMemo(
    () => buildCoverImageSrcCandidates(data.cover),
    [data.cover]
  );
  const localCoverPreview =
    typeof data.cover === "string" &&
    (data.cover.startsWith("data:image/") || data.cover.startsWith("blob:"))
      ? data.cover
      : null;
  const safeCoverSrc = localCoverPreview ?? coverCandidates[coverCandidateIndex] ?? null;
  const showCoverLoadingState = Boolean(data.cover) && !safeCoverSrc && !coverError;
  const normalizedPartnerCode = data.partnerCode.trim().toUpperCase();

  React.useEffect(() => {
    setCoverCandidateIndex(0);
  }, [data.cover, coverCandidates.length]);

  React.useEffect(() => {
    if (normalizedPartnerCode === partnerCodeState.validatedCode) return;
    setPartnerCodeState({
      status: "idle",
      message: null,
      validatedCode: ""
    });
  }, [normalizedPartnerCode, partnerCodeState.validatedCode]);

  const onCoverPick = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setCoverError(null);

      if (!COVER_ALLOWED_TYPES.has(file.type.toLowerCase())) {
        setCoverError("Обложка должна быть в формате JPG, PNG, WEBP или GIF.");
        return;
      }

      if (file.size > COVER_MAX_SIZE_BYTES) {
        setCoverError("Размер обложки не должен превышать 20 МБ.");
        return;
      }

      try {
        const { width, height } = await readImageSize(file);

        if (width < COVER_MIN_SIZE_PX || height < COVER_MIN_SIZE_PX) {
          setCoverError("Минимальное разрешение обложки — 1400×1400 px.");
          return;
        }

        if (width > COVER_MAX_SIZE_PX || height > COVER_MAX_SIZE_PX) {
          setCoverError("Максимальное разрешение обложки — 6000×6000 px.");
          return;
        }

        const dataUrl = await readAsDataUrl(file);

        patch({
          cover: dataUrl,
          coverUpload: null,
          coverMeta: {
            mimeType: file.type,
            sizeBytes: file.size,
            width,
            height,
            dpi: 72
          }
        });
      } catch {
        setCoverError("Не удалось обработать обложку. Попробуйте другой файл.");
      }
    },
    [patch]
  );

  const addPerson = () => {
    patch({
      persons: [...data.persons, { id: crypto.randomUUID(), name: "", role: "" }]
    });
  };

  const updatePerson = (id: string, field: "name" | "role", value: string) => {
    patch({
      persons: data.persons.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    });
  };

  const removePerson = (id: string) => {
    patch({ persons: data.persons.filter((p) => p.id !== id) });
  };

  const canAddPerson = data.persons.every(
    (person) => person.name.trim().length > 0 && person.role.trim().length > 0
  );

  const normalizedDefaultLabel = React.useMemo(() => data.label.trim().toUpperCase() === "ICECREAMMUSIC", [data.label]);

  const applyPartnerCode = React.useCallback(async () => {
    const rawCode = data.partnerCode.trim();
    if (!rawCode) {
      setPartnerCodeState({
        status: "invalid",
        message: "Введите партнёрский код.",
        validatedCode: ""
      });
      return;
    }

    setPartnerCodeState({
      status: "loading",
      message: null,
      validatedCode: ""
    });

    try {
      const response = await fetch("/api/partner-codes/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          code: rawCode
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; code?: string; message?: string; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setPartnerCodeState({
          status: "invalid",
          message: resolvePartnerCodeErrorMessage({
            status: response.status,
            payload
          }),
          validatedCode: ""
        });
        return;
      }

      const validatedCode = payload.code?.trim() || rawCode.toUpperCase();
      set("partnerCode", validatedCode);
      setPartnerCodeState({
        status: "valid",
        message: "Код применён. Оплата всего релиза будет покрыта.",
        validatedCode
      });
    } catch {
      setPartnerCodeState({
        status: "invalid",
        message: "Не удалось проверить код. Попробуйте ещё раз.",
        validatedCode: ""
      });
    }
  }, [data.partnerCode, set]);

  if (section === "basics") {
    return (
      <div className="space-y-5">
        <WizardCard className="overflow-hidden px-0 py-0">
          <div className="px-7 py-7 sm:px-9 sm:py-8">
            <section className="space-y-6">
              <div className="space-y-2">
                <p className="text-[12px] font-semibold uppercase tracking-[0.32em] text-white/45">Шаг 2</p>
                <h3 className="text-[30px] font-black tracking-[-0.03em] text-white sm:text-[34px]">
                  Обложка и информация о релизе
                </h3>
                <p className="text-[15px] text-[var(--ux-text-secondary)]">
                  Загрузите обложку, укажите название, жанр, язык и лейбл. Вся логика валидации и сохранения осталась прежней.
                </p>
              </div>

              <div className="grid items-stretch gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
                <div data-wizard-anchor="info-cover" className="flex h-full flex-col rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(24,26,42,0.82),rgba(13,16,30,0.78))] p-5">
                  <FieldLabel required>Обложка</FieldLabel>
                  <label
                    htmlFor="cover-upload"
                    className="group relative mt-3 grid aspect-square w-full cursor-pointer place-items-center overflow-hidden rounded-[22px] border border-white/[0.08] bg-white/[0.02] transition-colors hover:border-[var(--ux-accent)]/55 hover:bg-white/[0.04]"
                  >
                    {safeCoverSrc ? (
                      <Image
                        src={safeCoverSrc}
                        alt="Обложка релиза"
                        fill
                        sizes="280px"
                        className="object-cover"
                        onError={() =>
                          setCoverCandidateIndex((prev) =>
                            prev + 1 < coverCandidates.length ? prev + 1 : coverCandidates.length
                          )
                        }
                      />
                    ) : showCoverLoadingState ? (
                      <span className="flex flex-col items-center gap-2 text-center text-white/48">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-[12px]">Подготавливаем превью…</span>
                      </span>
                    ) : (
                      <span className="flex flex-col items-center gap-2 text-center text-white/40">
                        <Upload className="h-5 w-5" />
                        <span className="text-[12px]">Загрузить файл</span>
                      </span>
                    )}
                    <input
                      id="cover-upload"
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                      className="sr-only"
                      onChange={(event) => {
                        void onCoverPick(event);
                      }}
                    />
                  </label>
                  <p className="mt-2 text-[11px] leading-5 text-white/40">
                    JPG/PNG, до 20 МБ, 1400×1400 — 6000×6000, не менее 72 dpi.
                  </p>
                  {coverError ? <p className="mt-2 text-[12px] text-rose-300">{coverError}</p> : null}
                </div>

                <div data-wizard-anchor="info-basics" className="flex h-full flex-col gap-5 rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(24,26,42,0.82),rgba(13,16,30,0.78))] p-5">
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
                    <div className="min-w-0">
                      <FieldLabel
                        required
                        tooltip="Наименования на языках, использующих кириллицу, не должны быть представлены на транслите, если вы планируете отгрузку в Apple Music"
                        tooltipLabel="Подробнее о поле Название релиза"
                      >
                        Название релиза
                      </FieldLabel>
                      <TextInput
                        value={data.title}
                        onChange={(e) => set("title", e.target.value)}
                        placeholder="Введите название релиза"
                      />
                    </div>
                    <div className="min-w-0">
                      <FieldLabel
                        tooltip="Дополнительное название, например: Deluxe Edition, Remix, Acoustic Version. Если дополнительного названия нет, оставьте поле пустым"
                        tooltipLabel="Подробнее о поле Подзаголовок релиза"
                      >
                        Подзаголовок релиза
                      </FieldLabel>
                      <TextInput
                        value={data.subtitle}
                        onChange={(e) => set("subtitle", e.target.value)}
                        placeholder="Введите подзаголовок релиза"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
                    <div className="min-w-0">
                      <FieldLabel required>Жанр</FieldLabel>
                      <Select
                        value={data.genre}
                        onChange={(v) => set("genre", v)}
                        options={GENRES}
                        placeholder="Выберите жанр"
                      />
                    </div>
                    <div className="min-w-0">
                      <FieldLabel>Поджанр</FieldLabel>
                      <TextInput
                        value={data.subgenre}
                        onChange={(e) => set("subgenre", e.target.value)}
                        placeholder="Например: Synth Pop"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
                    <div className="min-w-0">
                      <FieldLabel
                        required
                        tooltip="Язык, на котором представлена основная информация о релизе"
                        tooltipLabel="Подробнее о поле Язык метаданных"
                      >
                        Язык метаданных
                      </FieldLabel>
                      <Select
                        value={data.language}
                        onChange={(v) => set("language", v)}
                        options={LANGUAGES}
                        placeholder="Выберите язык"
                      />
                    </div>
                    <div className="min-w-0">
                      <FieldLabel required>Лейбл</FieldLabel>
                      <TextInput
                        value={data.label}
                        onChange={(e) =>
                          patch({
                            label: e.target.value,
                            customLabel:
                              e.target.value.trim().length > 0 &&
                              e.target.value.trim().toUpperCase() !== "ICECREAMMUSIC"
                          })
                        }
                      />
                      {!normalizedDefaultLabel ? (
                        <button
                          type="button"
                          onClick={() => patch({ label: "ICECREAMMUSIC", customLabel: false })}
                          className="mt-3 inline-flex h-10 items-center rounded-[14px] border border-white/[0.1] bg-white/[0.03] px-4 text-[12.5px] font-medium text-white/70 transition hover:border-white/[0.18] hover:bg-white/[0.05] hover:text-white"
                        >
                          Вернуть лейбл ICECREAMMUSIC
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </WizardCard>
      </div>
    );
  }

  if (section === "persons") {
    return (
      <div className="space-y-5">
        <WizardCard className="overflow-hidden px-0 py-0">
          <div className="px-7 py-7 sm:px-9 sm:py-8">
            <section className="space-y-6">
              <div className="space-y-2">
                <p className="text-[12px] font-semibold uppercase tracking-[0.32em] text-white/45">Шаг 3</p>
                <h3 className="text-[30px] font-black tracking-[-0.03em] text-white">Персоны и роли</h3>
                <p className="text-[15px] text-[var(--ux-text-secondary)]">
                  Для Исполнителей, feat. и Remixer укажите псевдоним артиста.
                </p>
              </div>

              <div data-wizard-anchor="info-persons" className="rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(24,26,42,0.82),rgba(13,16,30,0.78))] p-5">
                {data.persons.length === 0 ? (
                  <p className="mb-3 text-[12.5px] text-[#ff5d6d]">
                    Добавьте хотя бы одну персону и присвойте ей роль
                  </p>
                ) : null}

                <div className="space-y-2">
                  {data.persons.map((p) => (
                    <div key={p.id} className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                      <TextInput
                        placeholder="Псевдоним / имя"
                        value={p.name}
                        onChange={(e) => updatePerson(p.id, "name", e.target.value)}
                      />
                      <Select
                        value={p.role}
                        onChange={(v) => updatePerson(p.id, "role", v)}
                        options={releasePersonRoleOptions}
                        placeholder="Роль"
                      />
                      <button
                        type="button"
                        onClick={() => removePerson(p.id)}
                        className="grid h-[52px] w-[52px] place-items-center rounded-[16px] border border-[var(--ux-accent)]/18 bg-[var(--ux-accent)]/[0.08] text-[var(--ux-accent)]/80 transition-colors hover:border-[var(--ux-accent)]/36 hover:bg-[var(--ux-accent)]/[0.14] hover:text-white"
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
                  className={cn(
                    "mt-4 inline-flex h-11 items-center gap-2 rounded-[16px] border px-4 text-[12.5px] font-medium transition-colors",
                    canAddPerson
                      ? "border-white/[0.1] bg-white/[0.03] text-white/86 hover:border-white/[0.18] hover:bg-white/[0.05]"
                      : "cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-white/28"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Добавить персону
                </button>
              </div>
            </section>
          </div>
        </WizardCard>
      </div>
    );
  }

  if (section === "codes") {
    return (
      <div className="space-y-5">
        <WizardCard className="overflow-hidden px-0 py-0">
          <div className="px-7 py-7 sm:px-9 sm:py-8">
            <section className="space-y-6">
              <div className="space-y-2">
                <p className="text-[12px] font-semibold uppercase tracking-[0.32em] text-white/45">Шаг 4</p>
                <h3 className="text-[30px] font-black tracking-[-0.03em] text-white">Коды и даты релиза</h3>
                <p className="text-[15px] text-[var(--ux-text-secondary)]">
                  Служебные поля собраны в отдельный шаг перед загрузкой аудио.
                </p>
              </div>

              <div className="grid items-stretch gap-6 xl:grid-cols-2 xl:gap-8">
                <div
                  data-wizard-anchor="info-codes"
                  className="grid content-start gap-10 rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(24,26,42,0.82),rgba(13,16,30,0.78))] px-6 py-6 sm:px-7 sm:py-7"
                >
                  <div className="grid content-start gap-3">
                    <div className="min-h-[24px]">
                      <FieldLabel
                        tooltip="Универсальный код продукта. Он нужен для идентификации релизов на разных площадках и для последующей отчетности. Если у вас его нет, оставьте поле пустым, мы присвоим код самостоятельно"
                        tooltipLabel="Подробнее о поле UPC"
                      >
                        UPC
                      </FieldLabel>
                    </div>
                    <TextInput
                      value={data.upc}
                      onChange={(e) => set("upc", e.target.value)}
                      placeholder="12-14 цифр"
                      className="w-full"
                    />
                  </div>
                  <div className="grid content-start gap-3">
                    <div className="min-h-[24px]">
                      <FieldLabel
                        tooltip="Ваш собственный код релиза. Укажите его для получения в финансовых отчетах"
                        tooltipLabel="Подробнее о поле Код партнёра"
                      >
                        Код партнёра
                      </FieldLabel>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
                      <TextInput
                        value={data.partnerCode}
                        onChange={(e) => set("partnerCode", e.target.value)}
                        placeholder="PARTNER-001"
                        className="w-full min-w-0"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void applyPartnerCode();
                        }}
                        disabled={!data.partnerCode.trim() || partnerCodeState.status === "loading"}
                        className={cn(
                          "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] border px-5 text-[12.5px] font-medium transition-colors",
                          !data.partnerCode.trim() || partnerCodeState.status === "loading"
                            ? "cursor-not-allowed border-white/[0.08] bg-white/[0.03] text-white/30"
                            : "border-[var(--ux-accent)]/35 bg-[var(--ux-accent)]/12 text-white hover:border-[var(--ux-accent)]/50 hover:bg-[var(--ux-accent)]/18"
                        )}
                      >
                        {partnerCodeState.status === "loading" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Применить
                      </button>
                    </div>
                    {partnerCodeState.message ? (
                      <p
                        className={cn(
                          "mt-2 flex items-start gap-2 text-[12px]",
                          partnerCodeState.status === "valid" ? "text-emerald-300" : "text-rose-300"
                        )}
                      >
                        {partnerCodeState.status === "valid" ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        )}
                        <span>{partnerCodeState.message}</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid content-start gap-10 rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(24,26,42,0.82),rgba(13,16,30,0.78))] px-6 py-6 sm:px-7 sm:py-7">
                  <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2">
                    <div className="grid min-w-0 grid-rows-[24px_52px] gap-3">
                      <CodesFieldLabel required>Дата предзаказа</CodesFieldLabel>
                      <DateInput
                        value={data.preorderDate}
                        onChange={(value) => set("preorderDate", value)}
                        className="min-w-0 w-full"
                      />
                    </div>
                    <div className="grid min-w-0 grid-rows-[24px_52px] gap-3">
                      <CodesFieldLabel required>Дата старта</CodesFieldLabel>
                      <DateInput
                        value={data.startDate}
                        onChange={(value) => set("startDate", value)}
                        className="min-w-0 w-full"
                      />
                    </div>
                    <div className="grid min-w-0 grid-rows-[24px_52px] gap-3">
                      <CodesFieldLabel required>Дата релиза</CodesFieldLabel>
                      <DateInput
                        value={data.releaseDate}
                        onChange={(value) => set("releaseDate", value)}
                        className="min-w-0 w-full"
                      />
                    </div>
                    <div className="grid min-w-0 grid-rows-[24px_52px] gap-3">
                      <CodesFieldLabel required>Год получения прав</CodesFieldLabel>
                      <TextInput
                        value={data.rightsYear}
                        onChange={(e) => set("rightsYear", e.target.value)}
                        placeholder="YYYY"
                        className="min-w-0 w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </WizardCard>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PlatformsSection />
      <TerritoriesSection />
    </div>
  );
}

function PlatformsSection() {
  const { data, patch, set } = useWizard();
  const [showAllPlatforms, setShowAllPlatforms] = React.useState(false);

  const isSelected = (code: string) => data.platforms.includes(code);

  const togglePlatform = (code: string) => {
    set(
      "platforms",
      data.platforms.includes(code)
        ? data.platforms.filter((item) => item !== code)
        : [...data.platforms, code]
    );
  };

  const selectedCount = data.platforms.length;
  const interactive = data.platformMode === "selected";
  const visiblePlatforms = showAllPlatforms
    ? releasePlatformDefinitions
    : releasePlatformDefinitions.slice(0, PLATFORM_PREVIEW_LIMIT);
  const canTogglePlatforms = releasePlatformDefinitions.length > PLATFORM_PREVIEW_LIMIT;

  return (
    <section className="space-y-6" data-wizard-anchor="info-platforms">
      <div className="space-y-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.32em] text-white/45">
          Шаг 5
        </p>
        <h3 className="text-[30px] font-black tracking-[-0.03em] text-white">Площадки распространения</h3>
        <p className="text-[15px] text-[var(--ux-text-secondary)]">
          Выберите сервисы и страны доставки релиза. Логика выбора и ограничений не менялась.
        </p>
      </div>
      <WizardCard className="!p-0">
      <div className="flex items-center justify-between border-b border-white/[0.08] p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-white">Площадки распространения</h3>
        <span className="rounded-md border border-[var(--ux-accent)]/18 bg-[var(--ux-accent)]/[0.10] px-2 py-1 text-[11px] tabular-nums text-white/72">
          {interactive ? selectedCount : releasePlatformDefinitions.length} / {releasePlatformDefinitions.length}
        </span>
      </div>

      <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[260px_1fr]">
        <div className="space-y-2">
          <SelectionModeButton
            checked={data.platformMode === "all"}
            onClick={() => patch({ platformMode: "all", platforms: [] })}
            label="На всех площадках"
          />
          <SelectionModeButton
            checked={data.platformMode === "selected"}
            onClick={() => patch({ platformMode: "selected" })}
            label="Только на некоторых"
          />
        </div>

        <div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePlatforms.map((platform) => {
              const selected = isSelected(platform.code);
              return (
                <button
                  key={platform.code}
                  type="button"
                  disabled={!interactive}
                  onClick={() => togglePlatform(platform.code)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors",
                    interactive
                      ? selected
                        ? "border-[var(--ux-accent)]/50 bg-[var(--ux-accent)]/[0.12] text-white"
                        : "border-white/[0.08] bg-white/[0.03] text-white/62 hover:border-[var(--ux-accent)]/35 hover:bg-white/[0.05] hover:text-white"
                      : "cursor-not-allowed border-[var(--ux-accent)]/16 bg-[var(--ux-accent)]/[0.06] text-white/48"
                  )}
                >
                  {platform.label}
                </button>
              );
            })}
          </div>
          {canTogglePlatforms ? (
            <button
              type="button"
              onClick={() => setShowAllPlatforms((value) => !value)}
              className="mt-3 text-[12.5px] font-medium text-[#b8a8ff] transition hover:text-white"
            >
              {showAllPlatforms ? "Скрыть площадки" : "Показать все площадки"}
            </button>
          ) : null}
        </div>
      </div>
    </WizardCard>
    </section>
  );
}

function TerritoriesSection() {
  const { data, set, patch } = useWizard();
  const [showAllCountries, setShowAllCountries] = React.useState(false);
  const filtered = COUNTRIES;

  const total = COUNTRIES.length;
  const visibleCountries = showAllCountries ? filtered : filtered.slice(0, COUNTRY_PREVIEW_LIMIT);
  const canToggleCountries = filtered.length > COUNTRY_PREVIEW_LIMIT;

  const isSelected = (code: string) => data.territoryCountries.includes(code);
  const toggleCountry = (code: string) => {
    const list = data.territoryCountries;
    set(
      "territoryCountries",
      list.includes(code) ? list.filter((c) => c !== code) : [...list, code]
    );
  };

  const onModeChange = (mode: typeof data.territoryMode) => {
    if (mode === "all") patch({ territoryMode: mode, territoryCountries: [] });
    else if (mode === "cis") patch({ territoryMode: mode, territoryCountries: CIS_CODES });
    else patch({ territoryMode: mode });
  };

  const interactive = data.territoryMode === "selected" || data.territoryMode === "exclude";

  return (
    <div data-wizard-anchor="info-territories">
      <WizardCard className="!p-0">
      <div className="flex items-center justify-between border-b border-white/[0.08] p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-white">Страны распространения</h3>
        <span className="rounded-md border border-[var(--ux-accent)]/18 bg-[var(--ux-accent)]/[0.10] px-2 py-1 text-[11px] tabular-nums text-white/72">
          {filtered.length}/{total}
        </span>
      </div>

      <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          <SelectionModeButton
            checked={data.territoryMode === "all"}
            onClick={() => onModeChange("all")}
            label="Во всех странах"
          />
          <SelectionModeButton
            checked={data.territoryMode === "selected"}
            onClick={() => onModeChange("selected")}
            label="Только в определённых"
          />
          <SelectionModeButton
            checked={data.territoryMode === "exclude"}
            onClick={() => onModeChange("exclude")}
            label="Во всех кроме"
          />
          <SelectionModeButton
            checked={data.territoryMode === "cis"}
            onClick={() => onModeChange("cis")}
            label="В СНГ"
          />
        </div>

        <div className={cn("pr-1", showAllCountries ? "max-h-[420px] overflow-y-auto" : "")}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleCountries.map((c) => {
              const sel = isSelected(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  disabled={!interactive}
                  onClick={() => toggleCountry(c.code)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors",
                    interactive
                      ? sel
                        ? "border-[var(--ux-accent)]/50 bg-[var(--ux-accent)]/[0.12] text-white"
                        : "border-white/[0.08] bg-white/[0.03] text-white/62 hover:border-[var(--ux-accent)]/35 hover:bg-white/[0.05] hover:text-white"
                      : "cursor-not-allowed border-[var(--ux-accent)]/16 bg-[var(--ux-accent)]/[0.06] text-white/48"
                  )}
                >
                  <span className="text-base leading-none">{flagEmoji(c.code)}</span>
                  <span className="truncate">{c.name}</span>
                  {data.territoryMode === "exclude" && sel ? (
                    <ExternalLink className="ml-auto h-3 w-3 text-[#ff5d6d]" />
                  ) : null}
                </button>
              );
            })}
          </div>
          {canToggleCountries ? (
            <button
              type="button"
              onClick={() => setShowAllCountries((value) => !value)}
              className="mt-3 text-[12.5px] font-medium text-[#b8a8ff] transition hover:text-white"
            >
              {showAllCountries ? "Скрыть страны" : "Показать все страны"}
            </button>
          ) : null}
        </div>
      </div>
    </WizardCard>
    </div>
  );
}

function SelectionModeButton({
  checked,
  onClick,
  label
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors",
        checked
          ? "border-[var(--ux-accent)]/50 bg-[var(--ux-accent)]/[0.10] text-white"
          : "border-white/[0.08] bg-white/[0.03] text-white/62 hover:border-white/[0.18] hover:text-white"
      )}
    >
      <span
        className={cn(
          "grid h-4 w-4 place-items-center rounded-full border transition-colors",
          checked ? "border-[var(--ux-accent)] bg-[var(--ux-accent)]" : "border-white/25"
        )}
      >
        {checked ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
      <span>{label}</span>
    </button>
  );
}
