"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Search,
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

import { useWizard, type ReleaseKind, type ReleaseType } from "./wizard-context";
import {
  Checkbox,
  DateInput,
  FieldLabel,
  RadioPill,
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

const TYPE_OPTIONS: Array<{ value: ReleaseType; label: string }> = [
  { value: "single", label: "Single" },
  { value: "ep", label: "EP" },
  { value: "album", label: "Album" }
];

const KIND_OPTIONS: Array<{ value: ReleaseKind; label: string }> = [
  { value: "standard", label: "Стандартный" },
  { value: "single_maxi", label: "Single Maxi" },
  { value: "mixtape", label: "Mixtape" },
  { value: "audiobook", label: "Аудиокнига" }
];

const COVER_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const COVER_MIN_SIZE_PX = 1400;
const COVER_MAX_SIZE_PX = 6000;
const COVER_ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const PLATFORM_PREVIEW_LIMIT = 12;
const COUNTRY_PREVIEW_LIMIT = 24;

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

export function StepInfo() {
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

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <WizardCard title="Обложка релиза" className="flex flex-col">
          <label
            htmlFor="cover-upload"
            className="group relative grid aspect-square w-full cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed border-white/[0.08] bg-white/[0.015] transition-colors hover:border-[#7b3df5]/50 hover:bg-white/[0.03]"
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
              <span className="flex flex-col items-center gap-2 text-center text-white/55">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-[12px]">Подготавливаем превью…</span>
              </span>
            ) : (
              <span className="flex flex-col items-center gap-2 text-center text-white/40">
                <Upload className="h-5 w-5" />
                <span className="text-[12px]">
                  Загрузить файл
                </span>
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
          <p className="mt-3 text-[11px] text-white/40">
            JPG/PNG, до 20 МБ, 1400×1400 — 6000×6000, не менее 72 dpi.
          </p>
          {coverError ? (
            <p className="mt-2 text-[12px] text-rose-300">{coverError}</p>
          ) : null}
        </WizardCard>

        <WizardCard title="Работа с релизом">
          <div className="space-y-4">
            <div>
              <FieldLabel required hint="Язык, на котором заполнены название и участники релиза">
                Язык метаданных
              </FieldLabel>
              <Select
                value={data.language}
                onChange={(v) => set("language", v)}
                options={LANGUAGES}
                placeholder="Выберите язык"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel required hint="Точное название релиза">
                  Название релиза
                </FieldLabel>
                <TextInput
                  value={data.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="Введите название релиза"
                />
              </div>
              <div>
                <FieldLabel hint="Дополнительное название (например, Deluxe Edition)">
                  Подзаголовок релиза
                </FieldLabel>
                <TextInput
                  value={data.subtitle}
                  onChange={(e) => set("subtitle", e.target.value)}
                  placeholder="Введите подзаголовок релиза"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel required>Жанр</FieldLabel>
                <Select
                  value={data.genre}
                  onChange={(v) => set("genre", v)}
                  options={GENRES}
                  placeholder="Выберите жанр"
                />
              </div>
              <div>
                <FieldLabel hint="Поджанр, если нужен">Поджанр</FieldLabel>
                <TextInput
                  value={data.subgenre}
                  onChange={(e) => set("subgenre", e.target.value)}
                  placeholder="Например: Synth Pop"
                />
              </div>
            </div>

            <div>
              <FieldLabel
                required
                hint="Вы выбираете тип релиза вручную. Количество треков не блокирует выбор Single, EP или Album."
              >
                Тип релиза
              </FieldLabel>
              <div className="flex flex-wrap gap-2">
                {TYPE_OPTIONS.map((opt) => (
                  <RadioPill
                    key={opt.value}
                    checked={data.type === opt.value}
                    onClick={() => set("type", opt.value)}
                  >
                    {opt.label}
                  </RadioPill>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-white/45">
                Тип релиза сохраняется таким, как вы выбрали. Система не меняет его автоматически по числу треков.
              </p>
            </div>

            <div>
              <FieldLabel>Вид релиза</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {KIND_OPTIONS.map((opt) => (
                  <RadioPill
                    key={opt.value}
                    checked={data.releaseKind === opt.value}
                    onClick={() => set("releaseKind", opt.value)}
                  >
                    {opt.label}
                  </RadioPill>
                ))}
              </div>
            </div>
          </div>
        </WizardCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <WizardCard title="Лейбл" description="Под именем какого лейбла будет выпущен релиз">
          <Checkbox
            checked={data.customLabel}
            onChange={(v) => {
              patch({
                customLabel: v,
                label: v ? "" : "ICECREAMMUSIC"
              });
            }}
            label='Изменить лейбл "ICECREAMMUSIC"'
            size="sm"
          />
          <div className="mt-3">
            <FieldLabel required>Лейбл</FieldLabel>
            <TextInput
              value={data.label}
              onChange={(e) => set("label", e.target.value)}
              disabled={!data.customLabel}
              className={cn(!data.customLabel && "cursor-not-allowed opacity-60")}
            />
          </div>
        </WizardCard>

        <WizardCard
          title="Персоны и роли"
          description="Для Исполнителей, feat. и Remixer укажите псевдоним артиста."
        >
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
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors",
              canAddPerson
                ? "border-white/[0.08] bg-white/[0.03] text-white/85 hover:border-white/[0.16] hover:bg-white/[0.06]"
                : "cursor-not-allowed border-white/[0.05] bg-white/[0.02] text-white/35"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить персону
          </button>
        </WizardCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <WizardCard
          title="Идентификация"
          description="UPC можно не заполнять — система присвоит автоматически после модерации"
        >
          <div className="space-y-3">
            <div>
              <FieldLabel>UPC</FieldLabel>
              <TextInput
                value={data.upc}
                onChange={(e) => set("upc", e.target.value)}
                placeholder="12-14 цифр"
              />
            </div>
            <div>
              <FieldLabel hint="Код применяется ко всему релизу, а не к отдельным трекам">
                Код партнёра
              </FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <TextInput
                  value={data.partnerCode}
                  onChange={(e) => set("partnerCode", e.target.value)}
                  placeholder="PARTNER-001"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => {
                    void applyPartnerCode();
                  }}
                  disabled={!data.partnerCode.trim() || partnerCodeState.status === "loading"}
                  className={cn(
                    "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-[12.5px] font-medium transition-colors",
                    !data.partnerCode.trim() || partnerCodeState.status === "loading"
                      ? "cursor-not-allowed border-white/[0.06] bg-white/[0.03] text-white/35"
                      : "border-[#7b3df5]/35 bg-[#7b3df5]/12 text-[#e6d7ff] hover:border-[#7b3df5]/50 hover:bg-[#7b3df5]/18"
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
              ) : (
                <p className="mt-2 text-[11px] text-white/40">
                  Один валидный код покрывает оплату всего релиза: single, EP или album целиком.
                </p>
              )}
            </div>
          </div>
        </WizardCard>

        <WizardCard title="Основные даты релиза">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <FieldLabel required>Дата предзаказа</FieldLabel>
              <DateInput
                value={data.preorderDate}
                onChange={(value) => set("preorderDate", value)}
              />
            </div>
            <div>
              <FieldLabel required>Дата старта</FieldLabel>
              <DateInput
                value={data.startDate}
                onChange={(value) => set("startDate", value)}
              />
            </div>
            <div>
              <FieldLabel required>Дата релиза</FieldLabel>
              <DateInput
                value={data.releaseDate}
                onChange={(value) => set("releaseDate", value)}
              />
            </div>
            <div>
              <FieldLabel required>Год получения прав</FieldLabel>
              <TextInput
                value={data.rightsYear}
                onChange={(e) => set("rightsYear", e.target.value)}
                placeholder="YYYY"
              />
            </div>
          </div>
        </WizardCard>
      </div>

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
    <WizardCard className="!p-0">
      <div className="flex items-center justify-between border-b border-white/[0.05] p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-white">Площадки распространения</h3>
        <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] tabular-nums text-white/55">
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
                        ? "border-[#7b3df5]/50 bg-[#7b3df5]/[0.12] text-white"
                        : "border-white/[0.06] bg-white/[0.02] text-white/75 hover:border-white/[0.16] hover:text-white"
                      : "cursor-not-allowed border-white/[0.05] bg-white/[0.015] text-white/55"
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
              className="mt-3 text-[12.5px] font-medium text-white/75 transition hover:text-white"
            >
              {showAllPlatforms ? "Скрыть площадки" : "Показать все площадки"}
            </button>
          ) : null}
        </div>
      </div>
    </WizardCard>
  );
}

function TerritoriesSection() {
  const { data, set, patch } = useWizard();
  const [query, setQuery] = React.useState("");
  const [showAllCountries, setShowAllCountries] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [query]);

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
    <WizardCard className="!p-0">
      <div className="flex items-center justify-between border-b border-white/[0.05] p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-white">Страны распространения</h3>
        <div className="flex items-center gap-3">
          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск"
              className="h-9 w-56 rounded-lg border border-white/[0.06] bg-white/[0.03] pl-8 pr-3 text-[12.5px] text-white placeholder:text-white/40 outline-none focus:border-[#7b3df5]/60"
            />
          </div>
          <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] tabular-nums text-white/55">
            {filtered.length}/{total}
          </span>
        </div>
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
                        ? "border-[#7b3df5]/50 bg-[#7b3df5]/[0.12] text-white"
                        : "border-white/[0.06] bg-white/[0.02] text-white/75 hover:border-white/[0.16] hover:text-white"
                      : "cursor-not-allowed border-white/[0.05] bg-white/[0.015] text-white/55"
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
              className="mt-3 text-[12.5px] font-medium text-white/75 transition hover:text-white"
            >
              {showAllCountries ? "Скрыть страны" : "Показать все страны"}
            </button>
          ) : null}
        </div>
      </div>
    </WizardCard>
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
          ? "border-[#7b3df5]/50 bg-[#7b3df5]/[0.10] text-white"
          : "border-white/[0.06] bg-white/[0.02] text-white/70 hover:border-white/[0.14] hover:text-white"
      )}
    >
      <span
        className={cn(
          "grid h-4 w-4 place-items-center rounded-full border transition-colors",
          checked ? "border-[#7b3df5] bg-[#7b3df5]" : "border-white/25"
        )}
      >
        {checked ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
      <span>{label}</span>
    </button>
  );
}
