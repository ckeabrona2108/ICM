"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { ChevronDown, Copy, ExternalLink, Plus, Save, Trash2 } from "lucide-react";

import type {
  SmartLinkContactEntry,
  SmartLinkCreditSection,
  SmartLinkFollowLinks,
  SmartLinkNewsFeedLinks,
  SmartLinkOwnerView,
  SmartLinkPlatformConfig,
  SmartLinkPlatformStatus,
  SmartLinkSectionVisibility,
  SmartLinkTheme,
  SmartLinkVideoEntry,
  SmartLinkPixelEntry
} from "@/lib/smart-link-service";
import {
  getSmartLinkPlatformLabel,
  SMART_LINK_PLATFORM_CATALOG,
  SMART_LINK_PRIMARY_PLATFORM_CODES,
  SMART_LINK_SECONDARY_PLATFORM_CATALOG
} from "@/lib/smart-link-platforms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { SmartLinkPlatformIcon } from "@/components/smart-link/platform-icon";

interface SmartLinkSettingsClientProps {
  releaseId: string;
  initialData: SmartLinkOwnerView;
}

const EDIT_TABS = ["Настройки", "Видео", "Авторы", "Ссылки", "Контакты", "Соцсети", "Лента новостей", "Пиксель"] as const;
const SMART_LINK_CONTROL_CLASS = "h-14 min-h-14 rounded-2xl";
const SMART_LINK_LABEL_CLASS = "block text-xs font-semibold uppercase leading-[1.35] tracking-[0.22em] text-white/45";
const SMART_LINK_FIELD_CLASS = "min-w-0 space-y-2.5";
const SMART_LINK_CARD_CONTENT_GRID_CLASS = "grid gap-4 md:grid-cols-6 xl:grid-cols-12";
const SMART_LINK_FORM_GRID_CLASS = "space-y-4";
const SMART_LINK_FORM_FULL_ROW_CLASS = "";
const SMART_LINK_ACTION_CLASS =
  "inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-5 text-sm font-medium text-white/82 transition hover:bg-white/[0.07]";

const SMART_LINK_PANEL_TRANSITION = { duration: 0.34, ease: [0.22, 1, 0.36, 1] as const };
const SMART_LINK_STACK_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04
    }
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.04,
      staggerDirection: -1
    }
  }
} as const;

const SMART_LINK_BLOCK_VARIANTS = {
  hidden: { opacity: 0, y: 26, scale: 0.985, filter: "blur(14px)" },
  visible: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, y: -18, scale: 0.985, filter: "blur(10px)" }
} as const;

const FOLLOW_LINK_META: Array<{ key: keyof SmartLinkFollowLinks; label: string; placeholder: string }> = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/artist" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@artist" },
  { key: "telegram", label: "Telegram", placeholder: "https://t.me/artist" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@artist" },
  { key: "vk", label: "VK", placeholder: "https://vk.com/artist" },
  { key: "discord", label: "Discord", placeholder: "https://discord.gg/artist" },
  { key: "website", label: "Website", placeholder: "https://artist.com" }
];

const NEWS_FEED_LINK_META: Array<{ key: keyof SmartLinkNewsFeedLinks; label: string; placeholder: string }> = [
  { key: "vk", label: "ВКонтакте", placeholder: "https://vk.com/artist" }
];

function sanitizeNewsFeedLinks(value: SmartLinkNewsFeedLinks): SmartLinkNewsFeedLinks {
  const next = { ...value };
  for (const item of NEWS_FEED_LINK_META) {
    const raw = next[item.key];
    next[item.key] =
      typeof raw === "string" && !["null", "undefined"].includes(raw.trim().toLowerCase()) ? raw : "";
  }
  return next;
}

function createCreditRow(): SmartLinkCreditSection["rows"][number] {
  return {
    id: crypto.randomUUID(),
    name: "",
    role: "",
    link: "",
    enabled: true
  };
}

function createVideoRow(): SmartLinkVideoEntry {
  return {
    id: crypto.randomUUID(),
    title: "",
    url: "",
    enabled: true
  };
}

function createInfoRow(label = ""): SmartLinkContactEntry {
  return {
    id: crypto.randomUUID(),
    label,
    value: "",
    enabled: true
  };
}

function sanitizeFollowLinks(value: SmartLinkFollowLinks): SmartLinkFollowLinks {
  const next = { ...value };
  for (const item of FOLLOW_LINK_META) {
    const raw = next[item.key];
    next[item.key] =
      typeof raw === "string" && !["null", "undefined"].includes(raw.trim().toLowerCase()) ? raw : "";
  }
  return next;
}

export function SmartLinkSettingsClient({
  releaseId,
  initialData
}: SmartLinkSettingsClientProps) {
  const [activeTab, setActiveTab] = React.useState<(typeof EDIT_TABS)[number]>("Настройки");
  const [slug, setSlug] = React.useState(initialData.publicSlug);
  const [theme, setTheme] = React.useState<SmartLinkTheme>(initialData.theme);
  const [allowWaveDownload, setAllowWaveDownload] = React.useState(initialData.allowWaveDownload);
  const [platforms, setPlatforms] = React.useState<SmartLinkPlatformConfig[]>(initialData.platforms);
  const [followLinks, setFollowLinks] = React.useState<SmartLinkFollowLinks>(() =>
    sanitizeFollowLinks(initialData.followLinks)
  );
  const [newsFeedLinks, setNewsFeedLinks] = React.useState<SmartLinkNewsFeedLinks>(() =>
    sanitizeNewsFeedLinks(initialData.newsFeedLinks)
  );
  const [sectionVisibility, setSectionVisibility] = React.useState<SmartLinkSectionVisibility>(initialData.sectionVisibility);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [publicUrl, setPublicUrl] = React.useState(initialData.publicUrl);
  const [platformPickerOpen, setPlatformPickerOpen] = React.useState(false);
  const [expandedPlatformCodes, setExpandedPlatformCodes] = React.useState<string[]>(
    initialData.platforms
      .filter((item) => !SMART_LINK_PRIMARY_PLATFORM_CODES.includes(item.code))
      .map((item) => item.code)
  );
  const [language] = React.useState("Русский");
  const [coverVideoUrl, setCoverVideoUrl] = React.useState(initialData.coverVideoUrl);
  const [inlineVideos, setInlineVideos] = React.useState<SmartLinkVideoEntry[]>(initialData.inlineVideos);
  const [creditSections, setCreditSections] = React.useState<SmartLinkCreditSection[]>(initialData.creditSections);
  const [contacts, setContacts] = React.useState<SmartLinkContactEntry[]>(initialData.contacts);
  const [pixels, setPixels] = React.useState<SmartLinkPixelEntry[]>(initialData.pixels);

  const visiblePlatforms = React.useMemo(
    () =>
      platforms.filter(
        (item) =>
          SMART_LINK_PRIMARY_PLATFORM_CODES.includes(item.code) || expandedPlatformCodes.includes(item.code)
      ),
    [expandedPlatformCodes, platforms]
  );
  const availablePlatformOptions = React.useMemo(
    () => SMART_LINK_SECONDARY_PLATFORM_CATALOG.filter((item) => !expandedPlatformCodes.includes(item.code)),
    [expandedPlatformCodes]
  );

  const updatePlatform = React.useCallback(
    (code: string, patch: Partial<SmartLinkPlatformConfig>) => {
      setPlatforms((current) =>
        current.map((item) => (item.code === code ? { ...item, ...patch } : item))
      );
    },
    []
  );

  const addPlatform = React.useCallback((code: string) => {
    setExpandedPlatformCodes((current) => (current.includes(code) ? current : [...current, code]));
    setPlatforms((current) => {
      if (current.some((item) => item.code === code)) return current;
      const nextOrder = current.length;
      return [
        ...current,
        {
          code,
          label: getSmartLinkPlatformLabel(code),
          status: "soon",
          url: null,
          order: nextOrder
        }
      ];
    });
    setPlatformPickerOpen(false);
  }, []);

  const updateCreditRow = React.useCallback(
    (sectionKey: string, rowId: string, patch: Partial<SmartLinkCreditSection["rows"][number]>) => {
      setCreditSections((current) =>
        current.map((section) =>
          section.key === sectionKey
            ? {
                ...section,
                rows: section.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
              }
            : section
        )
      );
    },
    []
  );

  const addCreditRow = React.useCallback((sectionKey: string) => {
    setCreditSections((current) =>
      current.map((section) =>
        section.key === sectionKey ? { ...section, rows: [...section.rows, createCreditRow()] } : section
      )
    );
  }, []);

  const removeCreditRow = React.useCallback((sectionKey: string, rowId: string) => {
    setCreditSections((current) =>
      current.map((section) => {
        if (section.key !== sectionKey) return section;
        const nextRows = section.rows.filter((row) => row.id !== rowId);
        return { ...section, rows: nextRows.length > 0 ? nextRows : [createCreditRow()] };
      })
    );
  }, []);

  const updateInlineVideo = React.useCallback((rowId: string, patch: Partial<SmartLinkVideoEntry>) => {
    setInlineVideos((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }, []);

  const addInlineVideo = React.useCallback(() => {
    setInlineVideos((current) => (current.length >= 10 ? current : [...current, createVideoRow()]));
  }, []);

  const removeInlineVideo = React.useCallback((rowId: string) => {
    setInlineVideos((current) => {
      const nextRows = current.filter((row) => row.id !== rowId);
      return nextRows.length > 0 ? nextRows : [createVideoRow()];
    });
  }, []);

  const updateInfoRow = React.useCallback(
    (
      kind: "contacts" | "pixels",
      rowId: string,
      patch: Partial<SmartLinkContactEntry | SmartLinkPixelEntry>
    ) => {
      const setter = kind === "contacts" ? setContacts : setPixels;
      setter((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
    },
    []
  );

  const addInfoRow = React.useCallback((kind: "contacts" | "pixels") => {
    const setter = kind === "contacts" ? setContacts : setPixels;
    setter((current) => [...current, createInfoRow(kind === "contacts" ? "Новая позиция" : "Новый пиксель")]);
  }, []);

  const removeInfoRow = React.useCallback((kind: "contacts" | "pixels", rowId: string) => {
    const setter = kind === "contacts" ? setContacts : setPixels;
    setter((current) => {
      const nextRows = current.filter((row) => row.id !== rowId);
      return nextRows.length > 0 ? nextRows : [createInfoRow()];
    });
  }, []);

  const save = React.useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/releases/${encodeURIComponent(releaseId)}/smart-link`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          slug,
          theme,
          allowWaveDownload,
          platforms: platforms.map((item) => ({
            code: item.code,
            order: item.order,
            status: item.status,
            url: item.url
          })),
          followLinks,
          newsFeedLinks,
          sectionVisibility,
          coverVideoUrl,
          inlineVideos,
          creditSections,
          contacts,
          pixels
        })
      });

      const payload = (await response.json().catch(() => null)) as SmartLinkOwnerView | { error?: string } | null;
      if (!response.ok || !payload || !("publicUrl" in payload)) {
        setError((payload && "error" in payload && payload.error) || "Не удалось сохранить настройки.");
        return;
      }

      setSlug(payload.publicSlug);
      setTheme(payload.theme);
      setAllowWaveDownload(payload.allowWaveDownload);
      setPlatforms(payload.platforms);
      setExpandedPlatformCodes(
        payload.platforms
          .filter((item) => !SMART_LINK_PRIMARY_PLATFORM_CODES.includes(item.code))
          .map((item) => item.code)
      );
      setFollowLinks(sanitizeFollowLinks(payload.followLinks));
      setNewsFeedLinks(sanitizeNewsFeedLinks(payload.newsFeedLinks));
      setSectionVisibility(payload.sectionVisibility);
      setPublicUrl(payload.publicUrl);
      setCoverVideoUrl(payload.coverVideoUrl);
      setInlineVideos(payload.inlineVideos);
      setCreditSections(payload.creditSections);
      setContacts(payload.contacts);
      setPixels(payload.pixels);
      setSuccess("Smart Link обновлён.");
    } catch {
      setError("Не удалось сохранить настройки.");
    } finally {
      setSaving(false);
    }
  }, [allowWaveDownload, contacts, coverVideoUrl, creditSections, followLinks, newsFeedLinks, inlineVideos, pixels, platforms, releaseId, sectionVisibility, slug, theme]);

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={[...EDIT_TABS]} active={activeTab} onChange={(value) => setActiveTab(value as (typeof EDIT_TABS)[number])} />

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className={SMART_LINK_ACTION_CLASS}
          >
            <ExternalLink className="h-4 w-4" />
            Открыть
          </a>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(publicUrl).catch(() => null);
            }}
            className={SMART_LINK_ACTION_CLASS}
          >
            <Copy className="h-4 w-4" />
            Копировать
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          variants={SMART_LINK_STACK_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={SMART_LINK_PANEL_TRANSITION}
          className="space-y-4"
        >
      {activeTab === "Настройки" ? (
        <>
          <AnimatedBlock><Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Настройки Smart Link</CardTitle>
                <p className="mt-2 text-sm text-white/60">
                  Главная ссылка для продвижения релиза. Открывается даже если часть площадок ещё в статусе «Скоро».
                </p>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-3 py-2 text-right">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Публичный URL</p>
                <p className="mt-1 max-w-[320px] truncate text-sm font-medium text-white/82">{publicUrl}</p>
              </div>
            </CardHeader>
            <CardContent className={SMART_LINK_FORM_GRID_CLASS}>
              <div className={SMART_LINK_FIELD_CLASS}>
                <label className={SMART_LINK_LABEL_CLASS}>Наименование короткой ссылки</label>
                <Input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="artist-song"
                  className={SMART_LINK_CONTROL_CLASS}
                />
              </div>
              <div className={SMART_LINK_FIELD_CLASS}>
                <label className={SMART_LINK_LABEL_CLASS}>Язык, используемый на ссылке</label>
                <Input value={language} readOnly className={`${SMART_LINK_CONTROL_CLASS} cursor-default opacity-90`} />
              </div>
              <div className={SMART_LINK_FIELD_CLASS}>
                <label className={SMART_LINK_LABEL_CLASS}>Тема оформления</label>
                <Select
                  value={theme}
                  onChange={(event) => setTheme(event.target.value as SmartLinkTheme)}
                  options={[
                    { value: "dark", label: "Темная" },
                    { value: "light", label: "Светлая" },
                    { value: "auto", label: "Авто" }
                  ]}
                  className={SMART_LINK_CONTROL_CLASS}
                />
              </div>
            </CardContent>
          </Card></AnimatedBlock>

        </>
      ) : null}

      {activeTab === "Видео" ? (
        <div className="space-y-4">
          <AnimatedBlock><Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Размещение видео на обложку</CardTitle>
                <p className="text-sm text-white/60">
                  Укажите одну ссылку из YouTube или Яндекс Музыки, видео будет размещено для просмотра с обложки релиза.
                </p>
              </div>
              <SectionVisibilityToggle
                label="Показывать блок"
                enabled={sectionVisibility.videos}
                onToggle={() => setSectionVisibility((current) => ({ ...current, videos: !current.videos }))}
              />
            </CardHeader>
            <CardContent className="space-y-2.5">
              <label className={SMART_LINK_LABEL_CLASS}>
                Ссылка на видео для обложки промо-ссылки
              </label>
              <Input
                value={coverVideoUrl}
                onChange={(event) => setCoverVideoUrl(event.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className={SMART_LINK_CONTROL_CLASS}
              />
            </CardContent>
          </Card></AnimatedBlock>

          <AnimatedBlock><Card>
            <CardHeader>
              <CardTitle>Размещение видео внутри страницы</CardTitle>
              <p className="text-sm text-white/60">
                Укажите одну ссылку или несколько (до 10) из YouTube или Яндекс Музыки, которые будут доступны для просмотра на промо-ссылке релиза.
              </p>
              <p className="text-sm text-white/45">
                Обратите внимание, видео Яндекс Музыки доступно для просмотра только внутри сервиса, при попытке воспроизведения, пользователь будет перенаправлен на сервис.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {inlineVideos.map((row) => (
                <EditableRowShell
                  key={row.id}
                  enabled={row.enabled}
                  onToggle={() => updateInlineVideo(row.id, { enabled: !row.enabled })}
                  onDelete={() => removeInlineVideo(row.id)}
                >
                  <div className="grid gap-3 md:grid-cols-[0.7fr_1.4fr]">
                    <Input
                      value={row.title}
                      onChange={(event) => updateInlineVideo(row.id, { title: event.target.value })}
                      placeholder="Введите заголовок"
                      className={SMART_LINK_CONTROL_CLASS}
                    />
                    <Input
                      value={row.url}
                      onChange={(event) => updateInlineVideo(row.id, { url: event.target.value })}
                      placeholder="https://music.yandex.ru/..."
                      className={SMART_LINK_CONTROL_CLASS}
                    />
                  </div>
                </EditableRowShell>
              ))}
              <button
                type="button"
                onClick={addInlineVideo}
                disabled={inlineVideos.length >= 10}
                className="inline-flex items-center gap-2 text-sm font-medium text-[#66d7d1] transition hover:text-[#86ebe5] disabled:cursor-not-allowed disabled:text-white/28"
              >
                <Plus className="h-4 w-4" />
                Добавить ещё
              </button>
            </CardContent>
          </Card></AnimatedBlock>
        </div>
      ) : null}

      {activeTab === "Авторы" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <SectionVisibilityToggle
              label="Показывать блок"
              enabled={sectionVisibility.credits}
              onToggle={() => setSectionVisibility((current) => ({ ...current, credits: !current.credits }))}
            />
          </div>
          {creditSections.map((section) => (
            <AnimatedBlock key={section.key}><Card>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <p className="text-sm text-white/60">{section.description}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {section.rows.map((row) => (
                  <EditableRowShell
                    key={row.id}
                    enabled={row.enabled}
                    onToggle={() => updateCreditRow(section.key, row.id, { enabled: !row.enabled })}
                    onDelete={() => removeCreditRow(section.key, row.id)}
                  >
                    <div className="grid gap-3 md:grid-cols-3">
                      <Input
                        value={row.name}
                        onChange={(event) => updateCreditRow(section.key, row.id, { name: event.target.value })}
                        placeholder="Введите имя"
                        className={SMART_LINK_CONTROL_CLASS}
                      />
                      <Input
                        value={row.role}
                        onChange={(event) => updateCreditRow(section.key, row.id, { role: event.target.value })}
                        placeholder="Укажите роль"
                        className={SMART_LINK_CONTROL_CLASS}
                      />
                      <Input
                        value={row.link}
                        onChange={(event) => updateCreditRow(section.key, row.id, { link: event.target.value })}
                        placeholder="Введите ссылку"
                        className={SMART_LINK_CONTROL_CLASS}
                      />
                    </div>
                  </EditableRowShell>
                ))}
                <button
                  type="button"
                  onClick={() => addCreditRow(section.key)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#66d7d1] transition hover:text-[#86ebe5]"
                >
                  <Plus className="h-4 w-4" />
                  Добавить ещё
                </button>
              </CardContent>
            </Card></AnimatedBlock>
          ))}
        </div>
      ) : null}

      {activeTab === "Ссылки" ? (
        <AnimatedBlock><Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Ссылки на площадки</CardTitle>
              <p className="mt-2 text-sm text-white/60">
                Основные площадки показываются сразу. Через кнопку «Добавить ещё» можно открыть и редактировать остальные сервисы.
              </p>
            </div>
            <SectionVisibilityToggle
              label="Показывать блок"
              enabled={sectionVisibility.links}
              onToggle={() => setSectionVisibility((current) => ({ ...current, links: !current.links }))}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <AnimatePresence initial={false}>
              {visiblePlatforms.map((item, index) => (
                <motion.div
                  layout
                  key={item.code}
                  initial={{ opacity: 0, y: 18, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -14, scale: 0.985 }}
                  transition={{ ...SMART_LINK_PANEL_TRANSITION, delay: index * 0.025 }}
                  className="grid gap-4 rounded-3xl border border-white/10 bg-black/20 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_160px] lg:items-center"
                >
                <div className="flex items-center gap-3">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">
                    <SmartLinkPlatformIcon code={item.code} size={56.5} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-white">{item.label}</p>
                  </div>
                </div>
                <Input
                  value={item.url ?? ""}
                  onChange={(event) => updatePlatform(item.code, { url: event.target.value })}
                  placeholder="https://..."
                  className={SMART_LINK_CONTROL_CLASS}
                />
                <Select
                  value={item.status}
                  onChange={(event) =>
                    updatePlatform(item.code, { status: event.target.value as SmartLinkPlatformStatus })
                  }
                  className={SMART_LINK_CONTROL_CLASS}
                  options={[
                    { label: "Опубликовано", value: "live" },
                    { label: "Скоро", value: "soon" },
                    { label: "Скрыто", value: "hidden" }
                  ]}
                />
                </motion.div>
              ))}
            </AnimatePresence>

            <div className="relative">
              <AnimatePresence initial={false}>
                {platformPickerOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                    transition={SMART_LINK_PANEL_TRANSITION}
                    className="mb-3 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#121621] shadow-[0_24px_80px_-40px_rgba(0,0,0,0.7)]"
                  >
                    <div className="max-h-[320px] overflow-y-auto p-2">
                    {availablePlatformOptions.length > 0 ? (
                      availablePlatformOptions.map((option) => (
                        <button
                          key={option.code}
                          type="button"
                          onClick={() => addPlatform(option.code)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white/80 transition hover:bg-white/[0.06] hover:text-white"
                        >
                          <SmartLinkPlatformIcon code={option.code} size={28} />
                          <span className="flex-1">{option.label}</span>
                          <Plus className="h-4 w-4 text-white/35" />
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-3 text-sm text-white/45">
                        Все дополнительные площадки уже открыты.
                      </div>
                    )}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <button
                type="button"
                onClick={() => setPlatformPickerOpen((current) => !current)}
                className="inline-flex items-center gap-2 text-sm font-medium text-[#66d7d1] transition hover:text-[#86ebe5]"
              >
                <Plus className="h-4 w-4" />
                Добавить ещё
                <ChevronDown className={`h-4 w-4 transition ${platformPickerOpen ? "rotate-180" : ""}`} />
              </button>
            </div>
          </CardContent>
        </Card></AnimatedBlock>
      ) : null}

      {activeTab === "Контакты" ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Контакты</CardTitle>
              <p className="text-sm text-white/60">
                Подготовленный блок для контактных точек артиста, лейбла и e-mail на странице релиза.
              </p>
            </div>
            <SectionVisibilityToggle
              label="Показывать блок"
              enabled={sectionVisibility.contacts}
              onToggle={() => setSectionVisibility((current) => ({ ...current, contacts: !current.contacts }))}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {contacts.map((row) => (
              <EditableRowShell
                key={row.id}
                enabled={row.enabled}
                onToggle={() => updateInfoRow("contacts", row.id, { enabled: !row.enabled })}
                onDelete={() => removeInfoRow("contacts", row.id)}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={row.label}
                    onChange={(event) => updateInfoRow("contacts", row.id, { label: event.target.value })}
                    placeholder="Введите заголовок"
                    className={SMART_LINK_CONTROL_CLASS}
                  />
                  <Input
                    value={row.value}
                    onChange={(event) => updateInfoRow("contacts", row.id, { value: event.target.value })}
                    placeholder="Укажите e-mail или ссылку"
                    className={SMART_LINK_CONTROL_CLASS}
                  />
                </div>
              </EditableRowShell>
            ))}
            <button
              type="button"
              onClick={() => addInfoRow("contacts")}
              className="inline-flex items-center gap-2 text-sm font-medium text-[#66d7d1] transition hover:text-[#86ebe5]"
            >
              <Plus className="h-4 w-4" />
              Добавить ещё
            </button>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "Соцсети" ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <CardTitle>Соцсети и follow</CardTitle>
            <SectionVisibilityToggle
              label="Показывать блок"
              enabled={sectionVisibility.socials}
              onToggle={() => setSectionVisibility((current) => ({ ...current, socials: !current.socials }))}
            />
          </CardHeader>
          <CardContent className={SMART_LINK_FORM_GRID_CLASS}>
            {FOLLOW_LINK_META.map((item, index) => (
              <div
                key={item.key}
                className={`${SMART_LINK_FIELD_CLASS} ${index === FOLLOW_LINK_META.length - 1 ? SMART_LINK_FORM_FULL_ROW_CLASS : ""}`}
              >
                <label className={SMART_LINK_LABEL_CLASS}>{item.label}</label>
                <Input
                  value={followLinks[item.key] ?? ""}
                  onChange={(event) =>
                    setFollowLinks((current) => ({
                      ...current,
                      [item.key]: event.target.value
                    }))
                  }
                  placeholder={item.placeholder}
                  className={SMART_LINK_CONTROL_CLASS}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "Лента новостей" ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Лента новостей</CardTitle>
              <p className="text-sm text-white/60">
                Позволяет добавить ссылки на источники контента для отображения ленты новостей из социальных сетей.
              </p>
            </div>
            <SectionVisibilityToggle
              label="Включить ленту новостей"
              enabled={sectionVisibility.newsFeed}
              onToggle={() => setSectionVisibility((current) => ({ ...current, newsFeed: !current.newsFeed }))}
            />
          </CardHeader>
          <CardContent className={SMART_LINK_FORM_GRID_CLASS}>
            {NEWS_FEED_LINK_META.map((item) => (
              <div key={item.key} className={SMART_LINK_FIELD_CLASS}>
                <label className={SMART_LINK_LABEL_CLASS}>{item.label}</label>
                <Input
                  value={newsFeedLinks[item.key] ?? ""}
                  onChange={(event) =>
                    setNewsFeedLinks((current) => ({
                      ...current,
                      [item.key]: event.target.value
                    }))
                  }
                  placeholder={item.placeholder}
                  className={SMART_LINK_CONTROL_CLASS}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "Пиксель" ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Пиксель</CardTitle>
              <p className="text-sm text-white/60">
                Секция подготовлена под marketing pixels и доп. трекинг кампаний без изменения текущего Smart Link tracking flow.
              </p>
            </div>
            <SectionVisibilityToggle
              label="Показывать блок"
              enabled={sectionVisibility.pixels}
              onToggle={() => setSectionVisibility((current) => ({ ...current, pixels: !current.pixels }))}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {pixels.map((row) => (
              <EditableRowShell
                key={row.id}
                enabled={row.enabled}
                onToggle={() => updateInfoRow("pixels", row.id, { enabled: !row.enabled })}
                onDelete={() => removeInfoRow("pixels", row.id)}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={row.label}
                    onChange={(event) => updateInfoRow("pixels", row.id, { label: event.target.value })}
                    placeholder="Введите название пикселя"
                    className={SMART_LINK_CONTROL_CLASS}
                  />
                  <Input
                    value={row.value}
                    onChange={(event) => updateInfoRow("pixels", row.id, { value: event.target.value })}
                    placeholder="Введите код пикселя"
                    className={SMART_LINK_CONTROL_CLASS}
                  />
                </div>
              </EditableRowShell>
            ))}
            <button
              type="button"
              onClick={() => addInfoRow("pixels")}
              className="inline-flex items-center gap-2 text-sm font-medium text-[#66d7d1] transition hover:text-[#86ebe5]"
            >
              <Plus className="h-4 w-4" />
              Добавить ещё
            </button>
          </CardContent>
        </Card>
      ) : null}

        </motion.div>
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={save}
          disabled={saving}
          className="h-14 w-full px-6 sm:w-auto sm:min-w-[18rem] sm:px-7"
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Сохраняем..." : "Сохранить Smart Link"}
        </Button>
        <Link
          href={`/dashboard/releases/${encodeURIComponent(releaseId)}`}
          className={`${SMART_LINK_ACTION_CLASS} w-full sm:w-auto`}
        >
          Назад к релизу
        </Link>
        {error ? <span className="text-sm text-rose-300">{error}</span> : null}
        {success ? <span className="text-sm text-emerald-300">{success}</span> : null}
      </div>
    </div>
  );
}

function AnimatedBlock({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={SMART_LINK_BLOCK_VARIANTS} transition={SMART_LINK_PANEL_TRANSITION} className={className}>
      {children}
    </motion.div>
  );
}

function SmartLinkSwitch({ enabled, onToggle, interactive = true }: { enabled: boolean; onToggle?: () => void; interactive?: boolean }) {
  const switchClassName = `relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors duration-200 ${
    enabled ? "border-emerald-400/45 bg-emerald-500/18" : "border-white/12 bg-white/[0.05]"
  }`;

  const thumb = (
    <motion.span
      animate={{ x: enabled ? 24 : 4, backgroundColor: enabled ? "rgb(110 231 183)" : "rgba(255,255,255,0.7)" }}
      transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.85 }}
      className="block h-6 w-6 rounded-full shadow-[0_4px_18px_rgba(0,0,0,0.28)]"
    />
  );

  if (!interactive) {
    return <span className={switchClassName}>{thumb}</span>;
  }

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className={switchClassName}
      aria-pressed={enabled}
    >
      {thumb}
    </motion.button>
  );
}

function EditableRowShell({
  children,
  enabled,
  onToggle,
  onDelete
}: {
  children: React.ReactNode;
  enabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.99 }}
      transition={SMART_LINK_PANEL_TRANSITION}
      className="grid gap-4 rounded-3xl border border-white/10 bg-black/20 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
    >
      <div className="min-w-0">{children}</div>
      <div className="flex items-center gap-2 self-start md:self-center">
        <SmartLinkSwitch enabled={enabled} onToggle={onToggle} />
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/60 transition hover:border-white/16 hover:bg-white/[0.08] hover:text-white"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

function SectionVisibilityToggle({
  label,
  enabled,
  onToggle
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-all duration-200 ease-out hover:-translate-y-0.5 ${
        enabled
          ? "border-emerald-400/28 bg-emerald-500/[0.08] text-white shadow-[0_14px_30px_-24px_rgba(52,211,153,0.72)]"
          : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.07] hover:text-white"
      }`}
    >
      <span>{label}</span>
      <span className="scale-[0.78] origin-center"><SmartLinkSwitch enabled={enabled} interactive={false} /></span>
    </button>
  );
}
