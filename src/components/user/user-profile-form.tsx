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
import {
  userProfileEmailSchema,
  userProfileNameSchema,
  validateAvatarDataUrl
} from "@/lib/user-profile-policy";

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
  const [saving, setSaving] = React.useState(false);
  const [avatarLoading, setAvatarLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
  }, [user]);

  async function onSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const parsedName = userProfileNameSchema.safeParse(name);
    if (!parsedName.success) {
      setError(parsedName.error.issues[0]?.message ?? "Проверьте имя.");
      return;
    }

    if (email.trim()) {
      const parsedEmail = userProfileEmailSchema.safeParse(email);
      if (!parsedEmail.success) {
        setError(parsedEmail.error.issues[0]?.message ?? "Проверьте email.");
        return;
      }
    }

    setSaving(true);
    try {
      await updateProfile({
        name: parsedName.data,
        email: email.trim() ? email.trim() : undefined
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

    setAvatarLoading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const check = validateAvatarDataUrl(dataUrl);
      if (!check.ok) {
        setError(check.error ?? "Некорректный аватар.");
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
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSaveProfile}>
          <div className="md:col-span-2 flex items-center gap-4 rounded-xl border border-white/[0.1] bg-white/[0.02] p-3">
            <UserAvatar name={user?.name} avatarUrl={user?.avatarUrl} size="lg" />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-white/[0.16] px-3 text-[14px] font-semibold text-white/88 hover:bg-white/[0.04]">
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
                onClick={() => {
                  void onDeleteAvatar();
                }}
                disabled={avatarLoading || !user?.avatarUrl}
              >
                Удалить аватар
              </Button>
              <p className="basis-full text-[13px] font-medium text-white/58">
                JPG/PNG/WEBP, до 2 МБ.
              </p>
            </div>
          </div>

          <Field label="Имя пользователя">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ваше имя"
              disabled={loading || saving}
            />
          </Field>

          <Field
            label="Email"
            suffix={<VerificationStatusBadge status={effectiveVerification.status} />}
          >
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              disabled={loading || saving}
            />
          </Field>

          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2">
            {error ? (
              <p className="text-[14px] font-medium text-rose-300">{error}</p>
            ) : success ? (
              <p className="text-[14px] font-medium text-emerald-300">{success}</p>
            ) : (
              <p className="text-[14px] font-medium text-white/60">
                Изменения обновляются во всех разделах кабинета.
              </p>
            )}
            <Button type="submit" disabled={loading || saving}>
              {saving ? "Сохранение..." : "Сохранить изменения"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  suffix,
  className,
  children
}: {
  label: string;
  suffix?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Label className="block text-[14px] font-medium text-white/74">{label}</Label>
        {suffix}
      </div>
      {children}
    </div>
  );
}
