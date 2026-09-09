"use client";

import * as React from "react";

import type { ContractStatusPayload } from "@/lib/contract-verification-shared";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user/user-avatar";
import { useCurrentUser } from "@/components/user/user-provider";
import { VerificationStatusBadge } from "@/components/verification/verification-status-badge";
import { normalizeArtistProfileType, type ArtistProfileType } from "@/lib/artist-profile-type";
import { ContractReadOnlyModal } from "@/components/verification/contract-readonly-modal";
import {
  userProfileEmailSchema,
  userProfileNameSchema,
  validateAvatarDataUrl
} from "@/lib/user-profile-policy";
import { cn } from "@/lib/utils";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export function UserProfileForm({
  contractStatus
}: {
  contractStatus: ContractStatusPayload;
}) {
  const { user, loading, updateProfile, uploadAvatar, deleteAvatar } = useCurrentUser();
  const effectiveVerification = user?.verification ?? contractStatus;
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [artistProfileType, setArtistProfileType] = React.useState<ArtistProfileType>("artist");
  const [saving, setSaving] = React.useState(false);
  const [avatarLoading, setAvatarLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<{ name?: string; email?: string; avatar?: string }>({});
  const [success, setSuccess] = React.useState<string | null>(null);
  const [contractViewerOpen, setContractViewerOpen] = React.useState(false);

  const canViewContract = effectiveVerification.isVerified;
  const subscriptionActive = Boolean(user?.hasActiveSubscription);
  const subscriptionLabel = subscriptionActive ? "Подписка активна" : "Активной подписки нет";
  const subscriptionClassName = subscriptionActive
    ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-200"
    : "border-rose-400/30 bg-rose-500/12 text-rose-200";

  React.useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setArtistProfileType(normalizeArtistProfileType(user.artistProfileType));
  }, [user]);

  async function onSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldErrors({});

    const parsedName = userProfileNameSchema.safeParse(name);
    if (!parsedName.success) {
      setFieldErrors({ name: parsedName.error.issues[0]?.message ?? "Проверьте имя." });
      return;
    }

    if (email.trim()) {
      const parsedEmail = userProfileEmailSchema.safeParse(email);
      if (!parsedEmail.success) {
        setFieldErrors({ email: parsedEmail.error.issues[0]?.message ?? "Проверьте email." });
        return;
      }
    }

    setSaving(true);
    try {
      await updateProfile({
        name: parsedName.data,
        email: email.trim() ? email.trim() : undefined,
        artistProfileType
      });
      setSuccess("Профиль обновлён.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось обновить профиль.");
    } finally {
      setSaving(false);
    }
  }

  async function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(null);
    setFieldErrors((current) => ({ ...current, avatar: undefined }));

    setAvatarLoading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const check = validateAvatarDataUrl(dataUrl);
      if (!check.ok) {
        setFieldErrors((current) => ({ ...current, avatar: check.error ?? "Некорректный аватар." }));
        return;
      }
      await uploadAvatar({ imageDataUrl: dataUrl });
      setSuccess("Аватар обновлён.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Не удалось загрузить аватар."
      );
    } finally {
      setAvatarLoading(false);
      event.target.value = "";
    }
  }

  async function onDeleteAvatar() {
    setError(null);
    setSuccess(null);
    setFieldErrors((current) => ({ ...current, avatar: undefined }));
    setAvatarLoading(true);
    try {
      await deleteAvatar();
      setSuccess("Аватар удалён.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить аватар.");
    } finally {
      setAvatarLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-6">
        <section className="ux-surface-soft rounded-[24px] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <UserAvatar name={user?.name} avatarUrl={user?.avatarUrl} size="lg" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c7bcff]">Профиль</p>
                <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-white">Публичные данные аккаунта</h2>
                <p className="mt-2 max-w-[44ch] text-[14px] leading-6 text-white/58">
                  Изменения сразу применяются к профилю, сообщениям, ленте и внутренним разделам кабинета.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className={cn("inline-flex h-10 items-center rounded-full border px-4 text-[12.5px] font-semibold", subscriptionClassName)}>
                {subscriptionLabel}
              </div>
              <VerificationStatusBadge
                status={effectiveVerification.status}
                className="h-10 items-center rounded-full px-4 py-0 text-[12.5px] font-semibold leading-none"
              />
              {canViewContract ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-full px-4 py-0 text-[12.5px] font-semibold leading-none text-white/85"
                  onClick={() => setContractViewerOpen(true)}
                >
                  Договор
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        {(error || success) ? (
          <div
            className={cn(
              error ? "ux-error text-rose-100" : "ux-surface-soft text-emerald-100 border-emerald-400/24 bg-emerald-500/10",
              "rounded-[22px] px-4 py-3 text-sm font-medium"
            )}
            role={error ? "alert" : "status"}
            aria-live="polite"
          >
            {error ?? success}
          </div>
        ) : null}

        <form className="grid gap-6" onSubmit={onSaveProfile}>
          <section className="ux-surface-soft rounded-[24px] p-4 sm:p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <h3 className="text-[18px] font-semibold text-white">Аватар и идентификация</h3>
                <p className="max-w-[42ch] text-[14px] leading-6 text-white/56">
                  Загрузите аватар, который будет отображаться в кабинете и публичных карточках.
                </p>
              </div>

              <div className="flex flex-col gap-3 lg:min-w-[360px]">
                <label className="ux-control-compact inline-flex h-11 cursor-pointer items-center justify-center rounded-[18px] px-4 text-[14px] font-semibold text-white/88 transition hover:text-white">
                  {avatarLoading ? "Загрузка..." : "Загрузить аватар"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/jpg"
                    className="hidden"
                    onChange={onAvatarChange}
                    disabled={avatarLoading}
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 rounded-[18px] text-[14px] font-semibold text-white/88"
                  onClick={() => {
                    void onDeleteAvatar();
                  }}
                  disabled={avatarLoading || !user?.avatarUrl}
                >
                  Удалить аватар
                </Button>
                <p className="text-[13px] leading-5 text-white/48">JPG/PNG/WEBP, до 2 МБ.</p>
                {fieldErrors.avatar ? <p className="text-sm font-medium text-rose-300">{fieldErrors.avatar}</p> : null}
              </div>
            </div>
          </section>

          <section className="ux-surface-soft rounded-[24px] p-4 sm:p-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Имя пользователя" error={fieldErrors.name} htmlFor="profile-name">
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ваше имя"
                  disabled={loading || saving}
                  aria-invalid={fieldErrors.name ? true : undefined}
                />
              </Field>

              <Field label="Email" error={fieldErrors.email} htmlFor="profile-email">
                <Input
                  id="profile-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  disabled={loading || saving}
                  aria-invalid={fieldErrors.email ? true : undefined}
                />
              </Field>
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[14px] leading-6 text-white/58">Изменения сохраняются и остаются после обновления страницы.</p>
            <button
              type="submit"
              disabled={loading || saving}
              className="ux-button-primary inline-flex h-11 w-full items-center justify-center rounded-[18px] px-7 text-[15px] font-semibold text-white sm:w-auto sm:min-w-[250px] disabled:opacity-50"
            >
              {saving ? "Сохранение..." : "Сохранить изменения"}
            </button>
          </div>
        </form>
      </CardContent>
      <ContractReadOnlyModal
        open={contractViewerOpen}
        onClose={() => setContractViewerOpen(false)}
      />
    </Card>
  );
}

function Field({
  label,
  suffix,
  htmlFor,
  error,
  children
}: {
  label: string;
  suffix?: React.ReactNode;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Label htmlFor={htmlFor} className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44">{label}</Label>
        {suffix}
      </div>
      {children}
      {error ? <p className="text-sm font-medium text-rose-300">{error}</p> : null}
    </div>
  );
}
