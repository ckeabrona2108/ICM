"use client";

import * as React from "react";
import { CheckCircle2, Globe2, Lock, Pencil, Rocket, Send, ShieldAlert, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type PromoFormPrefill,
  type PromoReleaseListItem,
  formatPromoSubmissionStatusLabel
} from "@/lib/promo-service";

const selectClassName =
  "block h-12 min-h-12 w-full appearance-none rounded-xl border border-white/[0.12] bg-black/25 px-4 py-0 text-[15px] font-medium leading-[1.2] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b3df5]/60";

function getStatusTone(status: string | null) {
  switch (status) {
    case "APPROVED":
    case "SENT_TO_PARTNERS":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
    case "REJECTED":
    case "CANCELLED":
      return "border-rose-400/30 bg-rose-500/10 text-rose-200";
    case "IN_REVIEW":
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    case "SUBMITTED":
      return "border-violet-400/30 bg-violet-500/10 text-violet-100";
    default:
      return "border-white/[0.1] bg-white/[0.04] text-white/72";
  }
}

function normalizeSocialUrl(value: string): string {
  return value.trim();
}

function parseSocialLinks(value: string) {
  const result = {
    website: "",
    telegram: "",
    vk: "",
    whatsapp: "",
  };

  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (!result.telegram && (lower.includes("t.me/") || lower.includes("telegram.me/") || lower.includes("telegram"))) {
      result.telegram = line;
      continue;
    }
    if (!result.vk && (lower.includes("vk.com/") || lower.includes("vkontakte") || lower.includes("vk.ru/"))) {
      result.vk = line;
      continue;
    }
    if (!result.whatsapp && (lower.includes("wa.me/") || lower.includes("whatsapp") || lower.includes("api.whatsapp"))) {
      result.whatsapp = line;
      continue;
    }
    if (!result.website) {
      result.website = line;
    }
  }

  return result;
}

function buildSocialLinksValue(fields: {
  website: string;
  telegram: string;
  vk: string;
  whatsapp: string;
}): string {
  return [fields.website, fields.telegram, fields.vk, fields.whatsapp]
    .map(normalizeSocialUrl)
    .filter(Boolean)
    .join("\n");
}

function clonePrefill(prefill: PromoFormPrefill): PromoFormPrefill {
  return { ...prefill };
}

type PromoFieldErrorKey =
  | keyof PromoFormPrefill
  | "socialLinks"
  | "socialLinks.website"
  | "socialLinks.telegram"
  | "socialLinks.vk"
  | "socialLinks.whatsapp";

type PromoFieldErrors = Partial<Record<PromoFieldErrorKey, string>>;

function getFieldErrorClass(message?: string) {
  return message ? "border-rose-400/60 focus-visible:ring-rose-400/40" : undefined;
}

function validatePromoForm(params: {
  form: PromoFormPrefill;
  socialLinks: ReturnType<typeof parseSocialLinks>;
}): PromoFieldErrors {
  const errors: PromoFieldErrors = {};
  const { form, socialLinks } = params;

  const requireText = (field: keyof PromoFormPrefill, message: string) => {
    if (!String(form[field] ?? "").trim()) errors[field] = message;
  };

  requireText("email", "Укажите электронную почту.");
  requireText("partnerName", "Укажите название партнёра.");
  requireText("artistName", "Укажите артиста.");
  requireText("artistCountry", "Укажите страну происхождения артиста.");
  requireText("releaseTitle", "Укажите название релиза.");
  requireText("releaseDate", "Укажите дату релиза.");
  requireText("genre", "Укажите жанр.");
  requireText("releaseLanguage", "Укажите язык релиза.");
  requireText("upc", "Укажите UPC.");
  requireText("keyTrackTitle", "Укажите название ключевого трека.");
  requireText("label", "Укажите лейбл.");
  requireText("releaseDescription", "Добавьте описание релиза и артиста.");
  requireText("promotionPlan", "Опишите продвижение релиза.");

  if (!form.artistPhotoUrl.trim()) {
    errors.artistPhotoUrl = "Укажите ссылку на фотографию артиста.";
  }

  if (!form.listeningLink.trim()) {
    errors.listeningLink = "Укажите ссылку на прослушивание релиза.";
  }

  const normalizedSocialLinks = buildSocialLinksValue(socialLinks);
  if (!normalizedSocialLinks) {
    errors.socialLinks = "Добавьте хотя бы одну ссылку на соцсети артиста.";
  }

  if (form.hasMusicVideo === "YES" && !form.videoPreviewUrl.trim()) {
    errors.videoPreviewUrl = "Добавьте ссылку на предпросмотр клипа.";
  }

  return errors;
}

function firstFieldError(errors: PromoFieldErrors): string | null {
  return Object.values(errors).find(Boolean) ?? null;
}

export function PromoDashboardClient({ initialReleases }: { initialReleases: PromoReleaseListItem[] }) {
  const [releases, setReleases] = React.useState(initialReleases);
  const [selectedReleaseId, setSelectedReleaseId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<PromoFormPrefill | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [deletingSubmissionId, setDeletingSubmissionId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [successReleaseTitle, setSuccessReleaseTitle] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<PromoFieldErrors>({});
  const [socialLinks, setSocialLinks] = React.useState(() => parseSocialLinks(""));
  const formRef = React.useRef<HTMLDivElement | null>(null);

  const selectedRelease = React.useMemo(
    () => releases.find((item) => item.id === selectedReleaseId) ?? null,
    [releases, selectedReleaseId]
  );
  const releaseSections = React.useMemo(
    () => [
      { key: "available", title: "Доступно для промо", items: releases.filter((item) => item.promoSection === "available" && item.isPromoAvailable) },
      { key: "sent", title: "Отправленные", items: releases.filter((item) => item.promoSection === "sent") },
      { key: "changes_required", title: "Требуются изменения", items: releases.filter((item) => item.promoSection === "changes_required") },
      { key: "history", title: "История", items: releases.filter((item) => item.promoSection === "history") }
    ].filter((section) => section.items.length > 0),
    [releases]
  );

  React.useEffect(() => {
    if (!selectedRelease) {
      setForm(null);
      return;
    }
    const nextForm = clonePrefill(selectedRelease.prefill);
    setForm(nextForm);
    setSocialLinks(parseSocialLinks(nextForm.artistSocialLinks));
    setFieldErrors({});
    setError(null);
  }, [selectedRelease]);

  const handleSelectRelease = React.useCallback((release: PromoReleaseListItem) => {
    if (!release.isPromoAvailable) return;
    setSelectedReleaseId(release.id);
    setSuccessReleaseTitle(null);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const handleDeleteSubmission = React.useCallback(async (release: PromoReleaseListItem) => {
    if (!release.promoSubmissionId || !release.promoDeleteable) return;

    setDeletingSubmissionId(release.promoSubmissionId);
    setError(null);
    try {
      const response = await fetch(`/api/promo/submissions/${release.promoSubmissionId}`, {
        method: "DELETE"
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(result?.error || "Не удалось удалить промо-заявку.");
      }

      setReleases((current) => current.map((item) => item.id === release.id
        ? {
            ...item,
            isPromoAvailable: true,
            unavailableReason: null,
            alreadySubmitted: false,
            promoSubmissionId: null,
            promoSubmissionStatus: null,
            promoAdminComment: null,
            promoEditable: false,
            promoDeleteable: false,
            promoSection: "available"
          }
        : item));
      if (selectedReleaseId === release.id) {
        setSelectedReleaseId(null);
        setForm(null);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить промо-заявку.");
    } finally {
      setDeletingSubmissionId(null);
    }
  }, [selectedReleaseId]);

  const patchField = React.useCallback(
    (field: keyof PromoFormPrefill, value: string | boolean) => {
      setForm((current) => (current ? { ...current, [field]: value } : current));
      setFieldErrors((current) => {
        if (!current[field]) return current;
        const next = { ...current };
        delete next[field];
        return next;
      });
    },
    []
  );

  const patchSocialLink = React.useCallback(
    (field: keyof ReturnType<typeof parseSocialLinks>, value: string) => {
      setSocialLinks((current) => {
        const next = { ...current, [field]: value };
        setForm((existing) =>
          existing
            ? {
                ...existing,
                artistSocialLinks: buildSocialLinksValue(next)
              }
            : existing
        );
        setFieldErrors((currentErrors) => {
          if (!currentErrors.socialLinks) return currentErrors;
          const nextErrors = { ...currentErrors };
          delete nextErrors.socialLinks;
          return nextErrors;
        });
        return next;
      });
    },
    []
  );

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedRelease || !form) return;

      const normalizedArtistPhotoUrl = form.artistPhotoUrl.trim();
      const normalizedListeningLink = form.listeningLink.trim();
      const normalizedSocialLinks = buildSocialLinksValue(socialLinks);
      const nextFieldErrors = validatePromoForm({ form, socialLinks });

      if (Object.keys(nextFieldErrors).length > 0) {
        setFieldErrors(nextFieldErrors);
        setError(firstFieldError(nextFieldErrors));
        return;
      }

      setIsSubmitting(true);
      setFieldErrors({});
      setError(null);

      const payload = {
        releaseId: selectedRelease.id,
        ...form,
        artistPhotoUrl: normalizedArtistPhotoUrl,
        listeningLink: normalizedListeningLink,
        artistSocialLinks: normalizedSocialLinks
      };

      try {
        const submissionId = selectedRelease.promoSubmissionId;
        const response = await fetch(
          submissionId ? `/api/promo/submissions/${submissionId}` : "/api/promo/submissions",
          {
            method: submissionId ? "PATCH" : "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          }
        );
        const result = (await response.json().catch(() => null)) as
          | { error?: string; item?: { id?: string } }
          | null;

        if (!response.ok) {
          throw new Error(result?.error || "Не удалось отправить заявку на промо.");
        }

        setReleases((current) =>
          current.map((item) =>
            item.id === selectedRelease.id
              ? {
                  ...item,
                  isPromoAvailable: false,
                  alreadySubmitted: true,
                  promoSubmissionId: result?.item?.id ?? item.promoSubmissionId,
                  promoSubmissionStatus: "SUBMITTED",
                  promoEditable: false,
                  promoDeleteable: true,
                  promoSection: "sent",
                  unavailableReason: "Заявка уже отправлена и находится в работе"
                }
              : item
          )
        );
        setSuccessReleaseTitle(selectedRelease.title);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Не удалось отправить заявку на промо.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, selectedRelease, socialLinks]
  );

  return (
    <div className="space-y-6">
      {successReleaseTitle ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.08] p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-300" />
            <div>
              <h2 className="text-lg font-semibold text-white">Ваш релиз отправлен на промо</h2>
              <p className="mt-1 text-sm font-medium text-emerald-100/80">{successReleaseTitle}</p>
              <button
                type="button"
                onClick={() => {
                  setSuccessReleaseTitle(null);
                  setSelectedReleaseId(null);
                }}
                className="mt-4 inline-flex text-sm font-semibold text-emerald-200 transition hover:text-white"
              >
                Вернуться к списку релизов
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {releaseSections.map((section) => (
        <section key={section.key} className="space-y-3">
          <h2 className="text-lg font-semibold text-white">{section.title}</h2>
          <div className="grid gap-4 xl:grid-cols-2">
        {section.items.map((release) => {
          const active = selectedReleaseId === release.id;
          const blocked = !release.isPromoAvailable;
          return (
            <div
              key={release.id}
              role={blocked ? undefined : "button"}
              tabIndex={blocked ? -1 : 0}
              onClick={blocked ? undefined : () => handleSelectRelease(release)}
              onKeyDown={blocked ? undefined : (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSelectRelease(release);
                }
              }}
              className={`rounded-2xl border p-4 transition ${
                blocked
                  ? "border-white/[0.08] bg-[#11131a]/72 opacity-78"
                  : active
                    ? "border-violet-400/28 bg-violet-500/[0.08]"
                    : "border-white/[0.08] bg-[#13151d]/92"
              } ${blocked ? "" : "cursor-pointer hover:border-violet-400/22"}`}
            >
              <div className="flex gap-4">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[20px] border border-white/[0.08] bg-black/20">
                  {release.coverUrl ? (
                    <img src={release.coverUrl} alt={release.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">
                      No Cover
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{release.title}</h3>
                      <p className="mt-1 text-sm text-white/70">{release.artist}</p>
                    </div>
                    {release.promoSubmissionStatus ? (
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getStatusTone(release.promoSubmissionStatus)}`}>
                        {formatPromoSubmissionStatusLabel(release.promoSubmissionStatus)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-white/62 sm:grid-cols-2">
                    <p>Дата релиза: <span className="text-white">{release.releaseDate}</span></p>
                    <p>UPC: <span className="text-white">{release.upc || "—"}</span></p>
                    <p className="sm:col-span-2">Жанр: <span className="text-white">{release.genre}</span></p>
                  </div>
                  {release.unavailableReason ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-400/18 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {release.unavailableReason}
                    </div>
                  ) : (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-400/18 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100">
                      <Rocket className="h-3.5 w-3.5" />
                      Доступно для отправки на промо
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {release.promoDeleteable ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={deletingSubmissionId === release.promoSubmissionId}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDeleteSubmission(release);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {deletingSubmissionId === release.promoSubmissionId ? "Удаляем..." : "Удалить"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant={blocked ? "outline" : "default"}
                  className="min-w-[230px] px-6"
                  disabled={blocked}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleSelectRelease(release);
                  }}
                >
                  {release.promoEditable ? (
                    <>
                      <Pencil className="mr-2 h-4 w-4" />
                      Исправить заявку
                    </>
                  ) : blocked ? (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Отправка недоступна
                    </>
                  ) : (
                    "Отправить на промо"
                  )}
                </Button>
              </div>
            </div>
          );
        })}
          </div>
        </section>
      ))}

      {selectedRelease && form && !successReleaseTitle ? (
        <div ref={formRef} className="rounded-2xl border border-white/[0.08] bg-[#13151d]/92 p-5 sm:p-6">
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-white">
              {selectedRelease.promoEditable ? "Исправление промо-заявки" : "Приоритетный релиз"}
            </h2>
            {selectedRelease.promoAdminComment ? (
              <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Комментарий администратора: {selectedRelease.promoAdminComment}
              </div>
            ) : null}
            <p className="mt-2 max-w-3xl text-[14px] text-white/68">
              Заполните форму для предоставления информации о вашем приоритетном релизе. Форма должна быть заполнена заранее. Релизы, отправленные слишком поздно, могут быть не рассмотрены.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Электронная почта</label>
                <Input type="email" className={cn(getFieldErrorClass(fieldErrors.email))} value={form.email} onChange={(event) => patchField("email", event.target.value)} required />
                {fieldErrors.email ? <p className="mt-2 text-xs text-rose-300">{fieldErrors.email}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Название партнёра</label>
                <Input className={cn(getFieldErrorClass(fieldErrors.partnerName))} value={form.partnerName} onChange={(event) => patchField("partnerName", event.target.value)} required />
                {fieldErrors.partnerName ? <p className="mt-2 text-xs text-rose-300">{fieldErrors.partnerName}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Артист</label>
                <Input className={cn(getFieldErrorClass(fieldErrors.artistName))} value={form.artistName} onChange={(event) => patchField("artistName", event.target.value)} required />
                {fieldErrors.artistName ? <p className="mt-2 text-xs text-rose-300">{fieldErrors.artistName}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Страна происхождения артиста</label>
                <Input className={cn(getFieldErrorClass(fieldErrors.artistCountry))} value={form.artistCountry} onChange={(event) => patchField("artistCountry", event.target.value)} required />
                {fieldErrors.artistCountry ? <p className="mt-2 text-xs text-rose-300">{fieldErrors.artistCountry}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Название релиза</label>
                <Input className={cn(getFieldErrorClass(fieldErrors.releaseTitle))} value={form.releaseTitle} onChange={(event) => patchField("releaseTitle", event.target.value)} required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Дата релиза</label>
                <Input type="date" className={cn(getFieldErrorClass(fieldErrors.releaseDate))} value={form.releaseDate} onChange={(event) => patchField("releaseDate", event.target.value)} required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Жанр</label>
                <Input className={cn(getFieldErrorClass(fieldErrors.genre))} value={form.genre} onChange={(event) => patchField("genre", event.target.value)} required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Формат</label>
                <select className={selectClassName} value={form.releaseFormat} onChange={(event) => patchField("releaseFormat", event.target.value)} required>
                  <option value="Single">Single</option>
                  <option value="EP">EP</option>
                  <option value="Album">Album</option>
                  <option value="Music Video">Music Video</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Язык релиза</label>
                <Input className={cn(getFieldErrorClass(fieldErrors.releaseLanguage))} value={form.releaseLanguage} onChange={(event) => patchField("releaseLanguage", event.target.value)} required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">UPC</label>
                <Input className={cn(getFieldErrorClass(fieldErrors.upc))} value={form.upc} onChange={(event) => patchField("upc", event.target.value)} required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Название ключевого трека</label>
                <Input className={cn(getFieldErrorClass(fieldErrors.keyTrackTitle))} value={form.keyTrackTitle} onChange={(event) => patchField("keyTrackTitle", event.target.value)} required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Релиз выходит вместе с клипом</label>
                <select
                  className={selectClassName}
                  value={form.hasMusicVideo}
                  onChange={(event) => {
                    const nextValue = event.target.value as "YES" | "NO";
                    patchField("hasMusicVideo", nextValue);
                    if (nextValue === "NO") {
                      patchField("videoPreviewUrl", "");
                    }
                  }}
                  required
                >
                  <option value="NO">Нет</option>
                  <option value="YES">Да</option>
                </select>
              </div>
              {form.hasMusicVideo === "YES" ? (
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-semibold text-white">Ссылка на предпросмотр клипа</label>
                  <Input type="url" className={cn(getFieldErrorClass(fieldErrors.videoPreviewUrl))} value={form.videoPreviewUrl} onChange={(event) => patchField("videoPreviewUrl", event.target.value)} placeholder="https://" />
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-white">Лейбл</label>
                <Input className={cn(getFieldErrorClass(fieldErrors.label))} value={form.label} onChange={(event) => patchField("label", event.target.value)} required />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-white">Описание релиза и артиста</label>
              <p className="mb-2 text-xs text-white/46">Опишите релиз: история создания, настроение, идея. Также опишите артиста от третьего лица.</p>
              <Textarea className={cn(getFieldErrorClass(fieldErrors.releaseDescription))} value={form.releaseDescription} onChange={(event) => patchField("releaseDescription", event.target.value)} required />
            </div>

            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Фотография артиста</label>
                <p className="mb-2 text-xs text-white/46">Ссылка на облачный сервис. Ссылка должна начинаться с https://. Название файла должно содержать имя артиста. Формат файла jpg.</p>
                <Input type="url" className={cn(getFieldErrorClass(fieldErrors.artistPhotoUrl))} value={form.artistPhotoUrl} onChange={(event) => patchField("artistPhotoUrl", event.target.value)} placeholder="https://" required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-white">Ссылка на прослушивание релиза</label>
                <p className="mb-2 text-xs text-white/46">Ссылка на облачный сервис. Качества mp3 достаточно. Ссылка должна начинаться с https://.</p>
                <Input type="url" className={cn(getFieldErrorClass(fieldErrors.listeningLink))} value={form.listeningLink} onChange={(event) => patchField("listeningLink", event.target.value)} placeholder="https://" required />
                {fieldErrors.listeningLink ? <p className="mt-2 text-xs text-rose-300">{fieldErrors.listeningLink}</p> : null}
              </div>
              {fieldErrors.socialLinks ? <p className="sm:col-span-2 text-xs text-rose-300">{fieldErrors.socialLinks}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-white">Продвижение</label>
              <p className="mb-2 text-xs text-white/46">Опишите, как и в какие сроки будет осуществляться продвижение релиза с вашей стороны. Какие ресурсы будут задействованы? Какой бюджет промо-кампании?</p>
              <Textarea className={cn(getFieldErrorClass(fieldErrors.promotionPlan))} value={form.promotionPlan} onChange={(event) => patchField("promotionPlan", event.target.value)} required />
            </div>

            <div>
              <label className="mb-3 block text-sm font-semibold text-white">Ссылки на соц. сети артиста</label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                    <Globe2 className="h-3.5 w-3.5" />
                    Сайт
                  </label>
                  <Input className={cn(getFieldErrorClass(fieldErrors.socialLinks))} value={socialLinks.website} onChange={(event) => patchSocialLink("website", event.target.value)} placeholder="https://artist.com" />
                </div>
                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                    <Send className="h-3.5 w-3.5" />
                    Telegram
                  </label>
                  <Input className={cn(getFieldErrorClass(fieldErrors.socialLinks))} value={socialLinks.telegram} onChange={(event) => patchSocialLink("telegram", event.target.value)} placeholder="https://t.me/artist" />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-white/55">VK</label>
                  <Input className={cn(getFieldErrorClass(fieldErrors.socialLinks))} value={socialLinks.vk} onChange={(event) => patchSocialLink("vk", event.target.value)} placeholder="https://vk.com/artist" />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-white/55">WhatsApp</label>
                  <Input className={cn(getFieldErrorClass(fieldErrors.socialLinks))} value={socialLinks.whatsapp} onChange={(event) => patchSocialLink("whatsapp", event.target.value)} placeholder="https://wa.me/79990000000" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <Checkbox
                checked={form.confirmationAccepted}
                onChange={(event) => patchField("confirmationAccepted", event.target.checked)}
                label="Я проверил актуальность ссылок на фотографии исполнителя и прослушивание релиза. Доступ к материалам открыт без дополнительного запроса. Мне понятно, что корректность заполнения формы может повлиять на поддержку релиза."
              />
            </div>

            {error ? <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" className="min-w-[230px] px-6" disabled={isSubmitting}>
                {isSubmitting ? "Отправляем..." : selectedRelease.promoEditable ? "Отправить повторно" : "Отправить на промо"}
              </Button>
              <button
                type="button"
                className="text-sm font-semibold text-white/62 transition hover:text-white"
                onClick={() => {
                  setSelectedReleaseId(null);
                  setForm(null);
                }}
              >
                Отменить
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
