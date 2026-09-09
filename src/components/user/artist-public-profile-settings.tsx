"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Camera, ExternalLink, Music2, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";
import {
  COLLABORATION_INTENTS,
  COLLABORATION_PREFERENCES,
  COLLABORATION_ROLES,
  collaborationIntentLabel,
  collaborationPreferenceLabel,
  collaborationRoleLabel,
  formatDelimitedList,
  parseDelimitedList
} from "@/lib/collaboration";
import type {
  ArtistProfileSettings,
  UserArtistProfileReleaseOption,
  UserArtistProfileSettings
} from "@/lib/artist-profile-service";
import { normalizeArtistProfileKey } from "@/lib/artist-profile-shared";
import { readJsonResponse } from "@/lib/client-json-response";

type ProfilePayload = {
  profiles: UserArtistProfileSettings[];
  releases: UserArtistProfileReleaseOption[];
  canSave: boolean;
  error?: string;
};

type ProfileMutationPayload = UserArtistProfileSettings & { error?: string };
type CommunityVisibilityMode = "all" | "none" | "selected";

const emptySettings: ArtistProfileSettings = {
  enabled: true,
  profileType: "artist",
  displayName: "",
  slug: "",
  bio: "",
  city: "",
  avatarKey: "",
  backgroundKey: "",
  catalogReleaseIds: [],
  hideAllCommunityReleases: false,
  hiddenCommunityReleaseIds: [],
  autoPublishApprovedReleases: false,
  websiteUrl: "",
  vkUrl: "",
  telegramUrl: "",
  collaboration: {
    open: false,
    role: "artist",
    genres: [],
    intents: [],
    preference: "hybrid",
    bio: ""
  }
};

function buildCommunitySetupStorageKey(artistKey: string) {
  return `community-onboarding-v1:${artistKey}`;
}

function shouldSuppressCommunitySetup(mode: CommunityVisibilityMode) {
  return mode === "none";
}

function deriveCommunityVisibilityMode(
  settings: ArtistProfileSettings,
  releases: UserArtistProfileReleaseOption[]
): CommunityVisibilityMode {
  if (settings.hideAllCommunityReleases) return "none";
  if (releases.length === 0) return "all";
  const selected = new Set(settings.catalogReleaseIds);
  const selectedCount = releases.filter((release) => selected.has(release.id)).length;
  if (selectedCount === 0) return "none";
  if (selectedCount === releases.length) return "all";
  return "selected";
}

export function ArtistPublicProfileSettings() {
  const [profiles, setProfiles] = React.useState<UserArtistProfileSettings[]>([]);
  const [releaseOptions, setReleaseOptions] = React.useState<UserArtistProfileReleaseOption[]>([]);
  const [activeArtistKey, setActiveArtistKey] = React.useState("");
  const [settings, setSettings] = React.useState(emptySettings);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const [uploadingBackground, setUploadingBackground] = React.useState(false);
  const [showAllCommunityReleaseControls, setShowAllCommunityReleaseControls] = React.useState(false);
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [communitySetupOpen, setCommunitySetupOpen] = React.useState(false);
  const [communitySetupBusy, setCommunitySetupBusy] = React.useState(false);
  const [communitySetupError, setCommunitySetupError] = React.useState<string | null>(null);
  const [communitySetupProfileType, setCommunitySetupProfileType] = React.useState<"artist" | "group" | "label">("artist");
  const [communitySetupMode, setCommunitySetupMode] = React.useState<CommunityVisibilityMode>("all");
  const [communitySetupSelectedReleaseIds, setCommunitySetupSelectedReleaseIds] = React.useState<string[]>([]);

  const activeProfile = profiles.find((profile) => profile.artistKey === activeArtistKey) ?? null;
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  const backgroundInputRef = React.useRef<HTMLInputElement>(null);
  const communitySetupBootstrappedRef = React.useRef<string | null>(null);
  const canSave = profiles.length > 0 && Boolean(activeProfile);
  const publicSlugPreview = settings.slug.trim() || activeProfile?.settings.slug || "";
  const publicHrefPreview = publicSlugPreview ? `/artists/${publicSlugPreview}` : null;
  const savedPublicHref = activeProfile ? `/artists/${activeProfile.slug}` : null;
  const hasUnsavedSlugChanges = Boolean(activeProfile && publicSlugPreview && activeProfile.slug !== publicSlugPreview);
  const backgroundImagePreview = backgroundPreviewUrl ?? (settings.backgroundKey ? activeProfile?.backgroundUrl ?? null : null);
  const catalogReleases = React.useMemo(
    () => releaseOptions.filter((release) => settings.catalogReleaseIds.includes(release.id)),
    [releaseOptions, settings.catalogReleaseIds]
  );
  const hiddenCommunityReleases = React.useMemo(
    () => catalogReleases.filter((release) => settings.hiddenCommunityReleaseIds.includes(release.id)),
    [catalogReleases, settings.hiddenCommunityReleaseIds]
  );

  React.useEffect(() => {
    if (!activeProfile) return;
    setCommunitySetupProfileType(settings.profileType === "group" || settings.profileType === "label" ? settings.profileType : "artist");
    setCommunitySetupMode(deriveCommunityVisibilityMode(settings, catalogReleases));
    setCommunitySetupSelectedReleaseIds(settings.catalogReleaseIds);
  }, [activeProfile, catalogReleases, settings]);

  React.useEffect(() => {
    if (!activeProfile || typeof window === "undefined") return;
    if (communitySetupBootstrappedRef.current === activeProfile.artistKey) return;
    communitySetupBootstrappedRef.current = activeProfile.artistKey;
    const storageKey = buildCommunitySetupStorageKey(activeProfile.artistKey);
    if (window.localStorage.getItem(storageKey) !== "done") {
      setCommunitySetupOpen(true);
    }
  }, [activeProfile]);

  React.useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/user/artist-profile", { signal: controller.signal })
      .then(async (response) => {
        const payload = await readJsonResponse<ProfilePayload>(response, "Не удалось загрузить настройки");
        if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить настройки");
        return payload as ProfilePayload;
      })
      .then((payload) => {
        const firstProfile = payload.profiles[0] ?? null;
        setProfiles(payload.profiles);
        setReleaseOptions(payload.releases);
        setActiveArtistKey(firstProfile?.artistKey ?? "");
        setSettings(firstProfile?.settings ?? emptySettings);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить настройки");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  function selectProfile(artistKey: string) {
    const profile = profiles.find((item) => item.artistKey === artistKey);
    if (!profile) return;
    setActiveArtistKey(profile.artistKey);
    setSettings(profile.settings);
    setShowAllCommunityReleaseControls(false);
    setMessage(null);
    setError(null);
  }

  function update<K extends keyof ArtistProfileSettings>(key: K, value: ArtistProfileSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateCollaboration<K extends keyof ArtistProfileSettings["collaboration"]>(
    key: K,
    value: ArtistProfileSettings["collaboration"][K]
  ) {
    setSettings((current) => ({
      ...current,
      collaboration: {
        ...current.collaboration,
        [key]: value
      }
    }));
  }

  function toggleIntent(intent: ArtistProfileSettings["collaboration"]["intents"][number]) {
    const intents = settings.collaboration.intents.includes(intent)
      ? settings.collaboration.intents.filter((item) => item !== intent)
      : [...settings.collaboration.intents, intent];
    updateCollaboration("intents", intents);
  }

  function updateProfileType(profileType: ArtistProfileSettings["profileType"]) {
    setSettings((current) => ({
      ...current,
      profileType,
      catalogReleaseIds: profileType === "artist" && activeProfile
        ? current.catalogReleaseIds.filter((releaseId) => {
            const release = releaseOptions.find((item) => item.id === releaseId);
            return release?.artistNames.some(
              (name) => normalizeArtistProfileKey(name) === activeProfile.artistKey
            );
          })
        : current.catalogReleaseIds
    }));
  }

  function toggleRelease(releaseId: string) {
    setSettings((current) => ({
      ...current,
      catalogReleaseIds: current.catalogReleaseIds.includes(releaseId)
        ? current.catalogReleaseIds.filter((id) => id !== releaseId)
        : [...current.catalogReleaseIds, releaseId],
      hiddenCommunityReleaseIds: current.catalogReleaseIds.includes(releaseId)
        ? current.hiddenCommunityReleaseIds.filter((id) => id !== releaseId)
        : current.hiddenCommunityReleaseIds
    }));
  }

  function toggleHiddenCommunityRelease(releaseId: string) {
    setSettings((current) => ({
      ...current,
      hiddenCommunityReleaseIds: current.hiddenCommunityReleaseIds.includes(releaseId)
        ? current.hiddenCommunityReleaseIds.filter((id) => id !== releaseId)
        : [...current.hiddenCommunityReleaseIds, releaseId]
    }));
  }

  function applyUpdatedProfile(updated: UserArtistProfileSettings) {
    setProfiles((current) => current.map((profile) =>
      profile.artistKey === updated.artistKey ? updated : profile
    ));
    setSettings(updated.settings);
    setBackgroundPreviewUrl(null);
  }

  async function uploadAvatar(file: File) {
    if (!activeProfile) return;
    setUploadingAvatar(true);
    setError(null);
    setMessage(null);
    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Не удалось прочитать изображение"));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/user/artist-profile/avatar", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artistKey: activeProfile.artistKey, settings, imageDataUrl })
      });
      const payload = await readJsonResponse<ProfileMutationPayload>(response, "Не удалось загрузить аватар");
      if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить аватар");
      applyUpdatedProfile(payload as UserArtistProfileSettings);
      setMessage("Аватар профиля обновлён.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить аватар");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function uploadBackground(file: File) {
    if (!activeProfile) return;
    setUploadingBackground(true);
    setError(null);
    setMessage(null);
    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Не удалось прочитать изображение"));
        reader.readAsDataURL(file);
      });
      setBackgroundPreviewUrl(imageDataUrl);
      const response = await fetch("/api/user/artist-profile/background", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artistKey: activeProfile.artistKey, settings, imageDataUrl })
      });
      const payload = await readJsonResponse<ProfileMutationPayload>(response, "Не удалось загрузить фон");
      if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить фон");
      applyUpdatedProfile(payload as UserArtistProfileSettings);
      setMessage("Фон профиля обновлён.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить фон");
    } finally {
      setUploadingBackground(false);
      if (backgroundInputRef.current) backgroundInputRef.current.value = "";
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!activeProfile) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/user/artist-profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artistKey: activeProfile.artistKey, settings })
      });
      const payload = await readJsonResponse<ProfileMutationPayload>(response, "Не удалось сохранить настройки");
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сохранить настройки");
      const updated = payload as UserArtistProfileSettings;
      applyUpdatedProfile(updated);
      setMessage(`Профиль ${updated.settings.displayName} обновлён. Публичная ссылка: /artists/${updated.slug}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить настройки");
    } finally {
      setSaving(false);
    }
  }

  function toggleCommunitySetupRelease(releaseId: string) {
    setCommunitySetupSelectedReleaseIds((current) => current.includes(releaseId)
      ? current.filter((id) => id !== releaseId)
      : [...current, releaseId]);
  }

  async function saveCommunitySetup() {
    if (!activeProfile) return;
    setCommunitySetupBusy(true);
    setCommunitySetupError(null);
    try {
      const nextSettings: ArtistProfileSettings = {
        ...settings,
        profileType: communitySetupProfileType,
        hideAllCommunityReleases: communitySetupMode === "none",
        catalogReleaseIds: communitySetupMode === "selected"
          ? communitySetupSelectedReleaseIds
          : catalogReleases.map((release) => release.id),
        hiddenCommunityReleaseIds: []
      };
      const response = await fetch("/api/user/artist-profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artistKey: activeProfile.artistKey, settings: nextSettings })
      });
      const payload = await readJsonResponse<ProfileMutationPayload>(response, "Не удалось сохранить настройки");
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сохранить настройки");
      const updated = payload as UserArtistProfileSettings;
      applyUpdatedProfile(updated);
      setMessage("Настройки Community сохранены.");
      setCommunitySetupOpen(false);
      if (typeof window !== "undefined") {
        const storageKey = buildCommunitySetupStorageKey(activeProfile.artistKey);
        if (shouldSuppressCommunitySetup(communitySetupMode)) {
          window.localStorage.setItem(storageKey, "done");
        } else {
          window.localStorage.removeItem(storageKey);
          communitySetupBootstrappedRef.current = null;
        }
      }
    } catch (saveError) {
      setCommunitySetupError(saveError instanceof Error ? saveError.message : "Не удалось сохранить настройки");
    } finally {
      setCommunitySetupBusy(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <CommunitySetupDialog
          open={communitySetupOpen}
          busy={communitySetupBusy}
          error={communitySetupError}
          profileType={communitySetupProfileType}
          visibilityMode={communitySetupMode}
          releases={catalogReleases}
          selectedReleaseIds={communitySetupSelectedReleaseIds}
          onClose={() => {
            setCommunitySetupOpen(false);
            setCommunitySetupError(null);
          }}
          onProfileTypeChange={setCommunitySetupProfileType}
          onVisibilityModeChange={setCommunitySetupMode}
          onToggleRelease={toggleCommunitySetupRelease}
          onConfirm={() => void saveCommunitySetup()}
        />
        <form className="grid gap-5" onSubmit={save}>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-white">
                <Music2 className="h-5 w-5 text-[#a99bff]" /> Публичные профили артистов
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/52">
                Каждый исполнитель из ваших релизов получает отдельный профиль и собственный
                каталог. Выберите артиста, чтобы настроить его страницу.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCommunitySetupError(null);
                  setCommunitySetupOpen(true);
                }}
                disabled={!activeProfile}
                className="mt-3 inline-flex h-10 items-center justify-center rounded-full border border-[#7b61ff]/28 bg-[#7b61ff]/10 px-4 text-sm font-medium text-white transition hover:bg-[#7b61ff]/16 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Настроить Community
              </button>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/80">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) => update("enabled", event.target.checked)}
                className="h-4 w-4 accent-[#7b61ff]"
                disabled={loading || !canSave}
              />
              Показывать профиль
            </label>
          </div>

          {profiles.length > 0 ? (
            <Field label="Профиль исполнителя">
              <select
                value={activeArtistKey}
                onChange={(event) => selectProfile(event.target.value)}
                disabled={loading || saving}
                className="h-12 w-full rounded-xl border border-white/10 bg-[#0d0e15] px-4 text-sm font-medium text-white outline-none transition focus:border-[#7b61ff]/65"
              >
                {profiles.map((profile) => (
                  <option key={profile.artistKey} value={profile.artistKey}>
                    {profile.sourceName} · {profile.releaseCount} рел.
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {activeProfile ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#7b61ff]/25 bg-[#7b61ff]/8 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.16em] text-white/42">Публичная ссылка</p>
                <p className="mt-1 truncate text-sm font-medium text-white/78">{publicHrefPreview ?? "Ссылка появится после сохранения"}</p>
                {hasUnsavedSlugChanges ? <p className="mt-1 text-xs text-amber-300/80">Есть несохранённые изменения. Нажмите «Сохранить профиль артиста».</p> : null}
              </div>
              <Link
                href={savedPublicHref ?? "#"}
                target="_blank"
                className={`inline-flex items-center gap-2 text-sm font-semibold ${savedPublicHref ? "text-[#c4b5fd] hover:text-white" : "pointer-events-none text-white/35"}`}
              >
                Открыть сохранённую <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          ) : null}

          {activeProfile ? (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
              <div className="relative h-44 w-full overflow-hidden bg-[linear-gradient(135deg,#8d6df6_0%,#d9a7b6_100%)]">
                {backgroundImagePreview ? (
                  <Image
                    src={backgroundImagePreview}
                    alt="Фон профиля"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : null}
                <div className="absolute inset-0 bg-black/20" />
              </div>
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">Фон профиля</p>
                  <p className="mt-1 text-sm text-white/48">JPG, PNG или WEBP до 5 МБ. Используется в публичной карточке профиля.</p>
                </div>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadBackground(file);
                  }}
                />
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" disabled={uploadingBackground} onClick={() => backgroundInputRef.current?.click()}>
                    <Camera className="mr-2 h-4 w-4" /> {uploadingBackground ? "Загрузка..." : "Загрузить фон"}
                  </Button>
                  {settings.backgroundKey ? (
                    <Button type="button" variant="outline" onClick={() => { update("backgroundKey", ""); setBackgroundPreviewUrl(null); }} aria-label="Удалить фон профиля">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {activeProfile ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:flex-row sm:items-center">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#171521] text-xl font-bold text-white">
                <ProfileAvatarPreview
                  name={settings.displayName || activeProfile.sourceName}
                  avatarUrl={activeProfile.avatarUrl}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">Аватар этого профиля</p>
                <p className="mt-1 text-sm text-white/48">JPG, PNG или WEBP до 2 МБ. Не влияет на аватары других профилей.</p>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAvatar(file);
                }}
              />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" disabled={uploadingAvatar} onClick={() => avatarInputRef.current?.click()}>
                  <Camera className="mr-2 h-4 w-4" /> {uploadingAvatar ? "Загрузка..." : "Загрузить"}
                </Button>
                {settings.avatarKey ? (
                  <Button type="button" variant="outline" onClick={() => update("avatarKey", "")} aria-label="Удалить аватар профиля">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Тип профиля">
              <select
                value={settings.profileType}
                onChange={(event) => updateProfileType(event.target.value as ArtistProfileSettings["profileType"])}
                disabled={loading || !canSave}
                className="h-12 w-full rounded-xl border border-white/10 bg-[#0d0e15] px-4 text-sm font-medium text-white outline-none transition focus:border-[#7b61ff]/65"
              >
                <option value="artist">Артист</option>
                <option value="group">Группа</option>
                <option value="label">Лейбл</option>
              </select>
            </Field>
            <Field label="Публичный ник / название">
              <Input value={settings.displayName} onChange={(event) => update("displayName", event.target.value)} disabled={loading || !canSave} />
            </Field>
            <Field label="Публичная ссылка профиля">
              <div className="flex items-center rounded-xl border border-white/10 bg-[#0d0e15] px-4">
                <span className="shrink-0 text-sm text-white/40">/artists/</span>
                <Input
                  value={settings.slug}
                  onChange={(event) => update("slug", event.target.value.toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, ""))}
                  placeholder="your-profile-link"
                  disabled={loading || !canSave}
                  className="border-0 bg-transparent px-2"
                />
              </div>
              <p className="mt-2 text-xs text-white/42">
                Будет открываться по адресу: {publicHrefPreview ?? "—"}
              </p>
            </Field>
            <Field label="Город">
              <Input value={settings.city} onChange={(event) => update("city", event.target.value)} placeholder="Например, Москва" disabled={loading || !canSave} />
            </Field>
            <Field label="Об артисте" className="md:col-span-2">
              <Textarea value={settings.bio} onChange={(event) => update("bio", event.target.value)} placeholder="Коротко расскажите о музыке и проекте" disabled={loading || !canSave} />
            </Field>
            <Field label="Сайт">
              <Input value={settings.websiteUrl} onChange={(event) => update("websiteUrl", event.target.value)} placeholder="Необязательно" disabled={loading || !canSave} />
            </Field>
            <Field label="VK">
              <Input value={settings.vkUrl} onChange={(event) => update("vkUrl", event.target.value)} placeholder="Необязательно" disabled={loading || !canSave} />
            </Field>
            <Field label="Telegram" className="md:col-span-2">
              <Input value={settings.telegramUrl} onChange={(event) => update("telegramUrl", event.target.value)} placeholder="Необязательно" disabled={loading || !canSave} />
            </Field>
            <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/78">
              <input
                type="checkbox"
                checked={settings.autoPublishApprovedReleases}
                onChange={(event) => update("autoPublishApprovedReleases", event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#7b61ff]"
                disabled={loading || !canSave}
              />
              <span>
                <span className="block font-semibold text-white">Автоматически публиковать одобренные релизы в сообществе</span>
                <span className="mt-1 block text-xs text-white/48">После принятия релиза админом в ленте этого профиля автоматически появится публикация с привязанным релизом.</span>
              </span>
            </label>
            <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/78">
              <input
                type="checkbox"
                checked={settings.hideAllCommunityReleases}
                onChange={(event) => update("hideAllCommunityReleases", event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#7b61ff]"
                disabled={loading || !canSave}
              />
              <span>
                <span className="block font-semibold text-white">Скрыть все релизы этого профиля из Community</span>
                <span className="mt-1 block text-xs text-white/48">Карточки релизов не будут показываться в общей ленте сообщества и не будут попадать в автопубликацию.</span>
              </span>
            </label>
          </div>

          <div className="grid gap-4 rounded-2xl border border-white/10 bg-[#0d0e15] p-4 sm:p-5 md:grid-cols-2">
            <div className="md:col-span-2 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">Сотрудничество</p>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/48">
                  Включите публичный статус для поиска продюсеров, артистов и других участников коллабораций.
                  Эти данные будут видны в профиле и доступны для публикаций в сообществе.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/80">
                <input
                  type="checkbox"
                  checked={settings.collaboration.open}
                  onChange={(event) => updateCollaboration("open", event.target.checked)}
                  className="h-4 w-4 accent-[#7b61ff]"
                  disabled={loading || !canSave}
                />
                Открыт к сотрудничеству
              </label>
            </div>

            <Field label="Роль">
              <select
                value={settings.collaboration.role}
                onChange={(event) => updateCollaboration("role", event.target.value as ArtistProfileSettings["collaboration"]["role"])}
                disabled={loading || !canSave}
                className="h-12 w-full rounded-xl border border-white/10 bg-[#0d0e15] px-4 text-sm font-medium text-white outline-none transition focus:border-[#7b61ff]/65"
              >
                {COLLABORATION_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {collaborationRoleLabel(role)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Формат работы">
              <select
                value={settings.collaboration.preference}
                onChange={(event) => updateCollaboration("preference", event.target.value as ArtistProfileSettings["collaboration"]["preference"])}
                disabled={loading || !canSave}
                className="h-12 w-full rounded-xl border border-white/10 bg-[#0d0e15] px-4 text-sm font-medium text-white outline-none transition focus:border-[#7b61ff]/65"
              >
                {COLLABORATION_PREFERENCES.map((value) => (
                  <option key={value} value={value}>
                    {collaborationPreferenceLabel(value)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Жанры" className="md:col-span-2">
              <Input
                value={formatDelimitedList(settings.collaboration.genres)}
                onChange={(event) => updateCollaboration("genres", parseDelimitedList(event.target.value))}
                placeholder="Например, pop, hyperpop, dance"
                disabled={loading || !canSave}
              />
            </Field>

            <Field label="Кого ищете" className="md:col-span-2">
              <div className="flex flex-wrap gap-2">
                {COLLABORATION_INTENTS.map((intent) => {
                  const active = settings.collaboration.intents.includes(intent);
                  return (
                    <button
                      key={intent}
                      type="button"
                      onClick={() => toggleIntent(intent)}
                      disabled={loading || !canSave}
                      className={`rounded-full border px-3 py-2 text-sm transition ${
                        active
                          ? "border-[#7b61ff]/55 bg-[#7b61ff]/18 text-white"
                          : "border-white/10 bg-white/[0.03] text-white/62 hover:border-white/18 hover:text-white"
                      }`}
                    >
                      {collaborationIntentLabel(intent)}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Кратко о запросе" className="md:col-span-2">
              <Textarea
                value={settings.collaboration.bio}
                onChange={(event) => updateCollaboration("bio", event.target.value)}
                placeholder="Например: Ищу продюсера для melodic trap EP, удалённо, с опытом в атмосферных аранжировках."
                disabled={loading || !canSave}
              />
            </Field>
          </div>

          {activeProfile ? (
            <div className="rounded-2xl border border-white/10 bg-[#0d0e15] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">Релизы в каталоге профиля</p>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/48">
                    Артист показывает только свои релизы. Группа может объединить до 10 артистов,
                    у лейбла ограничений нет. Снимите отметку здесь и включите релиз в другом профиле,
                    чтобы перенести его каталог.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/62">
                  Выбрано: {settings.catalogReleaseIds.length}
                </span>
              </div>
              <div className="mt-4 grid gap-2">
                {releaseOptions.map((release) => {
                  const belongsToArtist = release.artistNames.some(
                    (name) => normalizeArtistProfileKey(name) === activeProfile.artistKey
                  );
                  const disabled = settings.profileType === "artist" && !belongsToArtist;
                  return (
                    <label
                      key={release.id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-3 transition ${disabled ? "cursor-not-allowed border-white/5 opacity-40" : "cursor-pointer border-white/8 hover:border-[#7b61ff]/35"}`}
                    >
                      <input
                        type="checkbox"
                        checked={settings.catalogReleaseIds.includes(release.id)}
                        disabled={disabled || saving}
                        onChange={() => toggleRelease(release.id)}
                        className="h-4 w-4 accent-[#7b61ff]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{release.title}</span>
                        <span className="block truncate text-xs text-white/45">{release.artistNames.join(", ")}</span>
                      </span>
                      <span className="hidden text-xs text-white/38 sm:block">
                        {new Date(release.releaseDate).toLocaleDateString("ru-RU")}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {activeProfile ? (
            <div className="rounded-2xl border border-white/10 bg-[#0d0e15] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">Видимость релизов в Community</p>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/48">
                    Здесь можно скрыть отдельные релизы только из сообщества. Они останутся в каталоге публичного профиля и в кабинете.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/62">
                  Скрыто: {settings.hiddenCommunityReleaseIds.length}
                </span>
              </div>
              <div className="mt-4 grid gap-2">
                {hiddenCommunityReleases.length > 0 ? (
                  <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/42">
                      Сейчас скрыты
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {hiddenCommunityReleases.map((release) => (
                        <button
                          key={release.id}
                          type="button"
                          onClick={() => toggleHiddenCommunityRelease(release.id)}
                          disabled={saving}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-500/16"
                        >
                          <span className="max-w-[180px] truncate">{release.title}</span>
                          <span className="text-rose-200/70">показать</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {catalogReleases.length > 6 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllCommunityReleaseControls((current) => !current)}
                    className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/72 transition hover:border-[#7b61ff]/35 hover:text-white"
                  >
                    {showAllCommunityReleaseControls
                      ? "Свернуть полный список"
                      : `Показать весь список (${catalogReleases.length})`}
                  </button>
                ) : null}

                {(showAllCommunityReleaseControls ? catalogReleases : catalogReleases.slice(0, 6))
                  .map((release) => {
                    const hidden = settings.hiddenCommunityReleaseIds.includes(release.id);
                    return (
                      <label
                        key={release.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/8 px-3 py-3 transition hover:border-[#7b61ff]/35"
                      >
                        <input
                          type="checkbox"
                          checked={hidden}
                          disabled={saving}
                          onChange={() => toggleHiddenCommunityRelease(release.id)}
                          className="h-4 w-4 accent-[#7b61ff]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">{release.title}</span>
                          <span className="block truncate text-xs text-white/45">{release.artistNames.join(", ")}</span>
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${hidden ? "bg-rose-500/15 text-rose-200" : "bg-emerald-500/12 text-emerald-200"}`}>
                          {hidden ? "Скрыт" : "Виден"}
                        </span>
                      </label>
                    );
                  })}
                {catalogReleases.length > 6 && !showAllCommunityReleaseControls ? (
                  <div className="px-1 text-xs text-white/38">
                    Показаны первые 6 релизов. Остальные доступны по кнопке выше.
                  </div>
                ) : null}
                {settings.catalogReleaseIds.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-white/45">
                    Сначала добавьте релизы в каталог этого профиля.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium">
              {error ? <span className="text-rose-300">{error}</span> : null}
              {message ? <span className="text-emerald-300">{message}</span> : null}
              {!canSave && !loading && !error ? <span className="text-white/48">Создайте первый релиз, чтобы включить профиль.</span> : null}
            </div>
            <Button type="submit" disabled={loading || saving || !canSave} className="h-11 w-full rounded-full px-7 sm:w-auto sm:min-w-[250px]">
              {saving ? "Сохранение..." : "Сохранить профиль артиста"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CommunitySetupDialog({
  open,
  busy,
  error,
  profileType,
  visibilityMode,
  releases,
  selectedReleaseIds,
  onClose,
  onProfileTypeChange,
  onVisibilityModeChange,
  onToggleRelease,
  onConfirm
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  profileType: "artist" | "group" | "label";
  visibilityMode: CommunityVisibilityMode;
  releases: UserArtistProfileReleaseOption[];
  selectedReleaseIds: string[];
  onClose: () => void;
  onProfileTypeChange: (value: "artist" | "group" | "label") => void;
  onVisibilityModeChange: (value: CommunityVisibilityMode) => void;
  onToggleRelease: (releaseId: string) => void;
  onConfirm: () => void;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [busy, onClose, open]);

  if (!open) return null;

  const showSelectedControls = visibilityMode === "selected";

  return (
    <div className="fixed inset-0 z-[176] flex items-center justify-center bg-[#040610]/82 p-4 backdrop-blur-md" onClick={busy ? undefined : onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-setup-title"
        className="w-full max-w-[720px] rounded-[30px] border border-white/12 bg-[linear-gradient(180deg,rgba(22,25,40,0.98),rgba(10,12,22,0.98))] p-6 shadow-[0_40px_120px_-48px_rgba(0,0,0,0.9)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8f7cff]">Community Setup</p>
            <h2 id="community-setup-title" className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-white">
              Настройте отображение профиля и релизов
            </h2>
            <p className="mt-3 max-w-[560px] text-sm leading-6 text-white/64">
              Выберите тип профиля и решите, какие ваши релизы будут показываться в ленте сообщества.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/62 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-5">
          <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Тип профиля</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { value: "artist", label: "Артист" },
                { value: "group", label: "Группа" },
                { value: "label", label: "Лейбл" }
              ].map((option) => {
                const active = profileType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onProfileTypeChange(option.value as "artist" | "group" | "label")}
                    className={`inline-flex h-11 items-center justify-center rounded-full border px-5 text-sm font-medium transition ${
                      active
                        ? "border-[#7b61ff]/60 bg-[#7b61ff]/18 text-white shadow-[0_18px_40px_-24px_rgba(123,97,255,0.9)]"
                        : "border-white/10 bg-white/[0.03] text-white/76 hover:bg-white/[0.06]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">Показывать релизы в ленте</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                { value: "all", label: "Да, все релизы", description: "Все релизы этого профиля будут показаны в Community." },
                { value: "none", label: "Нет, не показывать", description: "Релизы этого профиля будут скрыты из Community." },
                { value: "selected", label: "Выборочные релизы", description: "Вы сами выберете, какие релизы этого профиля публиковать." }
              ].map((option) => {
                const active = visibilityMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onVisibilityModeChange(option.value as CommunityVisibilityMode)}
                    className={`rounded-[20px] border px-4 py-4 text-left transition ${
                      active
                        ? "border-[#7b61ff]/55 bg-[#171428] text-white shadow-[0_24px_48px_-28px_rgba(123,97,255,0.85)]"
                        : "border-white/10 bg-[#0f1420] text-white/72 hover:bg-[#141928]"
                    }`}
                  >
                    <div className="text-sm font-semibold">{option.label}</div>
                    <div className="mt-2 text-xs leading-5 text-white/50">{option.description}</div>
                  </button>
                );
              })}
            </div>

            {showSelectedControls ? (
              <div className="mt-4 rounded-[20px] border border-white/10 bg-[#0d111b] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">Выбранные релизы</p>
                  <span className="text-xs text-white/42">Отмечено: {selectedReleaseIds.length}</span>
                </div>
                {releases.length === 0 ? (
                  <p className="mt-3 text-sm text-white/54">У этого профиля пока нет релизов для выбора.</p>
                ) : (
                  <div className="mt-3 grid max-h-[260px] gap-2 overflow-y-auto pr-1">
                    {releases.map((release) => {
                      const checked = selectedReleaseIds.includes(release.id);
                      return (
                        <label
                          key={release.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-[16px] border px-3 py-3 transition ${
                            checked
                              ? "border-[#7b61ff]/45 bg-[#171428]"
                              : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleRelease(release.id)}
                            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent text-[#7b61ff] focus:ring-[#7b61ff]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-white">{release.title}</span>
                            <span className="mt-1 block text-xs leading-5 text-white/46">
                              {release.artistNames.join(", ")}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] px-5 text-sm font-medium text-white/82 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Позже
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center rounded-full border border-[#7b61ff]/30 bg-[linear-gradient(135deg,#7b61ff,#9d8dff)] px-5 text-sm font-semibold text-white shadow-[0_20px_48px_-24px_rgba(123,97,255,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Сохраняем..." : "Сохранить настройки"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileAvatarPreview({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  return (
    <Image
      src={avatarUrl && !failed ? avatarUrl : DEFAULT_USER_AVATAR_URL}
      alt={`Аватар ${name}`}
      fill
      unoptimized
      className="object-cover"
      onError={() => {
        if (avatarUrl) setFailed(true);
      }}
    />
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-sm font-medium text-white/72">{label}</Label>
      {children}
    </div>
  );
}
