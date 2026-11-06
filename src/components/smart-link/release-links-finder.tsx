"use client";

import * as React from "react";
import { AlertTriangle, Check, ExternalLink, Link2, Loader2, Plus, Search, X } from "lucide-react";

import { SmartLinkPlatformIcon } from "@/components/smart-link/platform-icon";
import { getSmartLinkPlatformLabel } from "@/lib/smart-link-platforms";

type ProfileStatus = "confirmed" | "suggested" | "rejected";

interface Profile {
  id: string;
  platform: string;
  externalId: string;
  name: string;
  url: string;
  imageUrl: string | null;
  status: ProfileStatus;
  source: string;
  hint: string | null;
  latestRelease: string | null;
  overlap: number | null;
}

interface Card {
  profileKey: string;
  name: string;
  releaseCount: number;
  profiles: Profile[];
}

interface MatchCheck {
  field: "title" | "artists" | "date" | "tracks";
  ok: boolean | null;
  note: string;
}

interface Candidate {
  url: string;
  title: string;
  artists: string[];
  releaseDate: string | null;
  trackCount: number | null;
  coverUrl: string | null;
  score: number;
  checks: MatchCheck[];
}

type CellState = "found" | "review" | "waiting" | "broken" | "upcoming" | "manual" | "none";

interface Cell {
  platform: string;
  state: CellState;
  url: string | null;
  candidates: Candidate[];
}

interface Row {
  releaseId: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  upc: string | null;
  releaseDate: string;
  trackCount: number;
  cells: Cell[];
}

interface Overview {
  cards: Card[];
  rows: Row[];
  configured: Record<string, boolean>;
  added?: number;
}

const CARD_PLATFORMS = ["yandex_music", "spotify", "apple_music", "youtube_music", "deezer", "vk_music", "zvuk_wink_music"];
const SEARCHABLE = new Set(["yandex_music", "spotify", "apple_music", "youtube_music", "deezer"]);
const TABLE_PLATFORMS = ["yandex_music", "vk_music", "zvuk_wink_music", "spotify", "apple_music", "youtube_music", "deezer"];

const CHECK_LABELS: Record<MatchCheck["field"], string> = {
  title: "Название",
  artists: "Исполнители",
  date: "Дата выхода",
  tracks: "Треков"
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  if (value.length === 4) return value;
  const [year, month, day] = value.slice(0, 10).split("-");
  return day && month ? `${day}.${month}.${year}` : value;
}

function initials(name: string): string {
  return name.replace(/[^\p{L}\p{N} ]/gu, "").trim().slice(0, 2).toUpperCase() || "♪";
}

async function postJson(url: string, body?: unknown): Promise<Overview> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "Не получилось. Попробуйте ещё раз.");
  return payload as Overview;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[18px] border border-zinc-800 bg-zinc-950 p-5 sm:max-w-[640px] sm:rounded-[18px]"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-semibold text-white">{title}</h3>
          <button type="button" aria-label="Закрыть" onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Cover({ src, label, size = 64 }: { src: string | null; label: string; size?: number }) {
  return src ? (
    <img src={src} alt="" className="shrink-0 rounded-lg object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="grid shrink-0 place-items-center rounded-lg bg-zinc-800 text-sm font-semibold text-zinc-300" style={{ width: size, height: size }}>
      {initials(label)}
    </div>
  );
}

function CheckPill({ check }: { check: MatchCheck }) {
  const tone = check.ok === true
    ? "bg-emerald-400/10 text-emerald-300"
    : check.ok === false
      ? "bg-rose-400/10 text-rose-300"
      : "bg-amber-400/10 text-amber-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${tone}`}>
      {check.ok === true ? <Check className="h-3 w-3" /> : check.ok === false ? <X className="h-3 w-3" /> : null}
      {check.note}
    </span>
  );
}

function ManualLinkForm({
  placeholder,
  submitLabel,
  onSubmit
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (url: string) => Promise<void>;
}) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim()) {
          setError("Вставьте ссылку");
          return;
        }
        setBusy(true);
        setError(null);
        onSubmit(value.trim())
          .catch((submitError: unknown) => setError(submitError instanceof Error ? submitError.message : "Не получилось"))
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          placeholder={placeholder}
          className="h-9 min-w-0 flex-1 rounded-[10px] border border-zinc-800 bg-zinc-900 px-3 text-[13.5px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-600"
        />
        <button type="submit" disabled={busy} className="h-9 shrink-0 rounded-[10px] border border-zinc-700 px-3 text-[13px] text-zinc-100 hover:bg-zinc-800 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
        </button>
      </div>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </form>
  );
}

function ProfileDialog({
  card,
  platform,
  onClose,
  onUpdate
}: {
  card: Card;
  platform: string;
  onClose: () => void;
  onUpdate: (overview: Overview) => void;
}) {
  const label = getSmartLinkPlatformLabel(platform);
  const profiles = card.profiles.filter((profile) => profile.platform === platform);
  const confirmed = profiles.filter((profile) => profile.status === "confirmed");
  const suggested = profiles.filter((profile) => profile.status === "suggested");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const decide = (profileId: string, decision: "confirm" | "reject") => {
    setBusyId(profileId);
    setError(null);
    postJson("/api/platform-links/profiles", { action: "decide", profileId, decision })
      .then((overview) => {
        onUpdate(overview);
        if (decision === "confirm") onClose();
      })
      .catch((decideError: unknown) => setError(decideError instanceof Error ? decideError.message : "Не получилось"))
      .finally(() => setBusyId(null));
  };

  return (
    <Modal title={`${card.name} в ${label}`} onClose={onClose}>
      {confirmed.length > 0 ? (
        <div className="mb-4 space-y-2">
          {confirmed.map((profile) => (
            <div key={profile.id} className="flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
              <Cover src={profile.imageUrl} label={profile.name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{profile.name}</p>
                <p className="text-xs text-emerald-300">Привязан{profile.source === "upc" ? " по вашему релизу" : ""}</p>
              </div>
              <a href={profile.url} target="_blank" rel="noreferrer" className="text-xs text-zinc-400 hover:text-white">
                Открыть <ExternalLink className="inline h-3 w-3" />
              </a>
              <button type="button" onClick={() => decide(profile.id, "reject")} className="text-xs text-zinc-500 hover:text-rose-300">
                Отвязать
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {suggested.length > 0 ? (
        <>
          <p className="mb-2 text-[13px] text-zinc-400">Нашли похожих артистов. Выберите свой профиль — по нему будем искать все ваши релизы.</p>
          <div className="mb-4 divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
            {suggested.map((profile) => (
              <div key={profile.id} className="flex items-center gap-3 p-3">
                <Cover src={profile.imageUrl} label={profile.name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{profile.name}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {[profile.hint, profile.latestRelease ? `последний: ${profile.latestRelease}` : null].filter(Boolean).join(" · ") || label}
                  </p>
                  {profile.overlap ? (
                    <p className="text-xs text-emerald-300">Здесь есть {profile.overlap} ваших релиза</p>
                  ) : null}
                </div>
                <a href={profile.url} target="_blank" rel="noreferrer" aria-label="Открыть профиль" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => decide(profile.id, "reject")}
                  className="h-8 rounded-lg px-2.5 text-[13px] text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-60"
                >
                  Не я
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => decide(profile.id, "confirm")}
                  className="h-8 rounded-lg bg-white px-3 text-[13px] font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
                >
                  {busyId === profile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Это я"}
                </button>
              </div>
            ))}
          </div>
        </>
      ) : confirmed.length === 0 ? (
        <p className="mb-4 text-[13px] text-zinc-400">
          {SEARCHABLE.has(platform)
            ? `Не нашли вас в ${label} по имени. Вставьте ссылку на свой профиль — или нажмите «Найти профили» позже, когда релиз появится на площадке.`
            : `${label} не даёт искать артистов автоматически. Вставьте ссылку на свой профиль один раз.`}
        </p>
      ) : null}

      {error ? <p className="mb-3 text-xs text-rose-300">{error}</p> : null}
      <p className="mb-2 text-xs text-zinc-500">Или вставьте ссылку на свой профиль</p>
      <ManualLinkForm
        placeholder={platform === "yandex_music" ? "https://music.yandex.ru/artist/…" : "Ссылка на профиль артиста"}
        submitLabel="Привязать"
        onSubmit={async (url) => {
          onUpdate(await postJson("/api/platform-links/profiles", { action: "add", profileKey: card.profileKey, platform, url }));
          onClose();
        }}
      />
    </Modal>
  );
}

function MatchDialog({
  row,
  cell,
  onClose,
  onUpdate
}: {
  row: Row;
  cell: Cell;
  onClose: () => void;
  onUpdate: (overview: Overview) => void;
}) {
  const label = getSmartLinkPlatformLabel(cell.platform);
  const [index, setIndex] = React.useState(0);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const candidate = cell.candidates[index] ?? null;

  const act = (action: Record<string, unknown>, key: string, close = true) => {
    setBusy(key);
    setError(null);
    return postJson("/api/platform-links/matches", { releaseId: row.releaseId, platform: cell.platform, action })
      .then((overview) => {
        onUpdate(overview);
        if (close) onClose();
      })
      .catch((actError: unknown) => setError(actError instanceof Error ? actError.message : "Не получилось"))
      .finally(() => setBusy(null));
  };

  const heading = cell.state === "review"
    ? `«${row.title}» в ${label} — это он?`
    : cell.state === "broken"
      ? `${label}: ссылка перестала открываться`
      : `«${row.title}» в ${label}`;

  return (
    <Modal title={heading} onClose={onClose}>
      {candidate ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-2 text-xs text-zinc-500">В кабинете</p>
              <div className="flex items-center gap-3">
                <Cover src={row.coverUrl} label={row.title} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{row.title}</p>
                  <p className="truncate text-xs text-zinc-400">{row.artist}</p>
                  <p className="text-xs text-zinc-500">{formatDate(row.releaseDate)} · {row.trackCount} тр.</p>
                </div>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-zinc-500">Нашли в {label}</p>
              <div className="flex items-center gap-3">
                <Cover src={candidate.coverUrl} label={candidate.title} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{candidate.title}</p>
                  <p className="truncate text-xs text-zinc-400">{candidate.artists.join(", ") || "—"}</p>
                  <p className="text-xs text-zinc-500">
                    {formatDate(candidate.releaseDate)}
                    {candidate.trackCount !== null ? ` · ${candidate.trackCount} тр.` : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <dl className="mt-4 divide-y divide-zinc-800/80 border-t border-zinc-800/80 text-[13px]">
            {candidate.checks.map((check) => (
              <div key={check.field} className="flex items-center justify-between gap-3 py-2">
                <dt className="text-zinc-400">{CHECK_LABELS[check.field]}</dt>
                <dd><CheckPill check={check} /></dd>
              </div>
            ))}
          </dl>

          <a href={candidate.url} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-between rounded-xl bg-zinc-900 px-3 py-2.5 text-[13px] text-zinc-300 hover:bg-zinc-800">
            <span>Послушать и проверить в {label}</span>
            <ExternalLink className="h-4 w-4" />
          </a>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => act({ kind: "confirm", url: candidate.url }, "confirm")}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-black hover:bg-zinc-200 disabled:opacity-60"
            >
              {busy === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Да, это мой релиз
            </button>
            {cell.candidates.length > 1 ? (
              <button
                type="button"
                onClick={() => setIndex((index + 1) % cell.candidates.length)}
                className="h-9 rounded-[10px] border border-zinc-700 px-3 text-[13px] text-zinc-200 hover:bg-zinc-800"
              >
                Другой вариант ({index + 1}/{cell.candidates.length})
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                void act({ kind: "reject", url: candidate.url }, "reject", false).then(() => setIndex(0));
              }}
              className="h-9 rounded-[10px] border border-zinc-700 px-3 text-[13px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
            >
              Не то
            </button>
          </div>
        </>
      ) : cell.state === "broken" && cell.url ? (
        <p className="text-[13px] text-zinc-400">
          Площадка больше не открывает{" "}
          <a href={cell.url} target="_blank" rel="noreferrer" className="text-zinc-200 underline">прежнюю ссылку</a>. Кнопку на
          смарт-ссылке мы скрыли и ищем релиз заново. Если знаете новую ссылку — вставьте её.
        </p>
      ) : cell.state === "found" && cell.url ? (
        <p className="text-[13px] text-zinc-400">
          Сейчас на смарт-ссылке:{" "}
          <a href={cell.url} target="_blank" rel="noreferrer" className="break-all text-zinc-200 underline">{cell.url}</a>. Если она
          ведёт не туда, вставьте правильную — автопоиск её больше не заменит.
        </p>
      ) : (
        <p className="text-[13px] text-zinc-400">
          {cell.state === "manual"
            ? `${label} не даёт искать релизы автоматически. Вставьте ссылку один раз — она появится на смарт-ссылке.`
            : `Пока не нашли релиз в ${label}. Вставьте ссылку сами или подождите — проверяем каждый день.`}
        </p>
      )}

      {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}

      <div className="mt-5 border-t border-zinc-800/80 pt-4">
        <p className="mb-2 text-xs text-zinc-500">Вставить свою ссылку на релиз в {label}</p>
        <ManualLinkForm
          placeholder="Ссылка на альбом или сингл"
          submitLabel="Сохранить"
          onSubmit={async (url) => {
            onUpdate(await postJson("/api/platform-links/matches", { releaseId: row.releaseId, platform: cell.platform, action: { kind: "manual", url } }));
            onClose();
          }}
        />
        {cell.state !== "waiting" && cell.state !== "found" ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => act({ kind: "waiting" }, "waiting")}
            className="mt-3 text-[13px] text-zinc-400 hover:text-white"
          >
            Ещё не вышел здесь — сообщить, когда появится
          </button>
        ) : null}
      </div>
    </Modal>
  );
}

function ProfileChip({ card, platform, onOpen }: { card: Card; platform: string; onOpen: () => void }) {
  const profiles = card.profiles.filter((profile) => profile.platform === platform);
  const confirmed = profiles.some((profile) => profile.status === "confirmed");
  const suggested = profiles.some((profile) => profile.status === "suggested");
  const [text, tone] = confirmed
    ? ["Привязан", "text-emerald-300"]
    : suggested
      ? ["Проверьте", "text-amber-300"]
      : SEARCHABLE.has(platform)
        ? ["Не найден", "text-zinc-500"]
        : ["Вставить ссылку", "text-zinc-500"];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-2 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-left transition hover:border-zinc-700 hover:bg-zinc-900"
    >
      <SmartLinkPlatformIcon code={platform} size={20} />
      <span className="text-[12.5px] text-zinc-300">{getSmartLinkPlatformLabel(platform)}</span>
      <span className={`text-xs ${tone}`}>{text}</span>
    </button>
  );
}

function CellButton({ cell, onOpen }: { cell: Cell; onOpen: () => void }) {
  if (cell.state === "found" && cell.url) {
    return (
      <span className="inline-flex items-center gap-1">
        <a href={cell.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-emerald-400/10 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-400/20">
          <Check className="h-3 w-3" /> Есть
        </a>
        <button type="button" aria-label="Изменить ссылку" onClick={onOpen} className="rounded p-0.5 text-zinc-600 hover:text-zinc-300">
          <Link2 className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }
  const styles: Record<Exclude<CellState, "found">, [string, string]> = {
    review: ["Это он?", "bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"],
    broken: ["Не открывается", "bg-rose-400/10 text-rose-300 hover:bg-rose-400/20"],
    upcoming: ["Ждём выхода", "text-zinc-500"],
    waiting: ["Ждём", "text-zinc-500 hover:text-zinc-300"],
    manual: ["Вставить", "text-zinc-400 hover:text-white"],
    none: ["—", "text-zinc-600 hover:text-zinc-300"]
  };
  const [label, tone] = styles[cell.state as Exclude<CellState, "found">];
  if (cell.state === "upcoming") return <span className={`text-xs ${tone}`}>{label}</span>;
  return (
    <button type="button" onClick={onOpen} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition ${tone}`}>
      {cell.state === "broken" ? <AlertTriangle className="h-3 w-3" /> : null}
      {label}
    </button>
  );
}

export function ReleaseLinksFinder() {
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [suggesting, setSuggesting] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [profileDialog, setProfileDialog] = React.useState<{ profileKey: string; platform: string } | null>(null);
  const [matchDialog, setMatchDialog] = React.useState<{ releaseId: string; platform: string } | null>(null);

  React.useEffect(() => {
    fetch("/api/platform-links", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setOverview((await response.json()) as Overview);
      })
      .catch(() => setLoadError("Не удалось загрузить карточки артистов"));
  }, []);

  if (loadError) return <p className="text-sm text-rose-300">{loadError}</p>;
  if (!overview) {
    return (
      <div className="flex items-center gap-2 rounded-[14px] border border-zinc-800 bg-zinc-950/60 px-4 py-5 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Загружаем карточки артистов…
      </div>
    );
  }

  const reviewCount = overview.rows.reduce((sum, row) => sum + row.cells.filter((cell) => cell.state === "review").length, 0);
  const foundRows = overview.rows.filter((row) => row.cells.some((cell) => cell.state === "found")).length;
  const activeCard = profileDialog ? overview.cards.find((card) => card.profileKey === profileDialog.profileKey) : null;
  const activeRow = matchDialog ? overview.rows.find((row) => row.releaseId === matchDialog.releaseId) : null;
  const activeCell = activeRow?.cells.find((cell) => cell.platform === matchDialog?.platform) ?? null;

  const findReleases = () => {
    setSearching(true);
    setNotice(null);
    postJson("/api/platform-links/discover")
      .then((next) => {
        setOverview(next);
        const review = next.rows.reduce((sum, row) => sum + row.cells.filter((cell) => cell.state === "review").length, 0);
        setNotice(
          next.added
            ? `Добавили ${next.added} ссылок в смарт-ссылки.${review ? ` Проверьте ещё ${review} — отмечены «Это он?».` : ""}`
            : review
              ? `Новых точных совпадений нет. Проверьте ${review} вариантов «Это он?».`
              : "Новых ссылок не нашли. Мы проверяем площадки каждый день и сообщим, когда релиз появится."
        );
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Не получилось"))
      .finally(() => setSearching(false));
  };

  const suggest = (profileKey: string) => {
    setSuggesting(profileKey);
    postJson("/api/platform-links/profiles", { action: "suggest", profileKey })
      .then(setOverview)
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Не получилось"))
      .finally(() => setSuggesting(null));
  };

  return (
    <section id="release-links" className="space-y-4 scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-white">Ваши релизы на площадках</h2>
          <p className="mt-1 text-[13px] text-zinc-400">
            Привяжите профиль артиста один раз — дальше ссылки на все релизы находятся сами.
          </p>
        </div>
        <button
          type="button"
          onClick={findReleases}
          disabled={searching}
          className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-white px-4 text-[14px] font-medium text-black transition hover:bg-zinc-200 disabled:opacity-70"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {searching ? "Ищем на площадках…" : "Найти мои релизы"}
        </button>
      </div>

      {notice ? <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[13px] text-zinc-300">{notice}</p> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {overview.cards.map((card) => (
          <div key={card.profileKey} className="rounded-[14px] border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-violet-500/15 text-sm font-semibold text-violet-200">
                {initials(card.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-white">{card.name}</p>
                <p className="text-xs text-zinc-500">{card.releaseCount} релизов в кабинете</p>
              </div>
              <button
                type="button"
                onClick={() => suggest(card.profileKey)}
                disabled={suggesting !== null}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 text-[12.5px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
              >
                {suggesting === card.profileKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Найти профили
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {CARD_PLATFORMS.map((platform) => (
                <ProfileChip
                  key={platform}
                  card={card}
                  platform={platform}
                  onOpen={() => setProfileDialog({ profileKey: card.profileKey, platform })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {overview.rows.length > 0 ? (
        <div className="overflow-x-auto rounded-[14px] border border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3 text-[13px]">
            <span className="text-zinc-300">Ссылки есть у {foundRows} из {overview.rows.length} релизов</span>
            {reviewCount > 0 ? <span className="text-amber-300">Проверьте: {reviewCount}</span> : null}
          </div>
          <table className="w-full min-w-[860px] table-fixed text-left">
            <colgroup>
              <col />
              {TABLE_PLATFORMS.map((platform) => <col key={platform} className="w-[96px]" />)}
            </colgroup>
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs text-zinc-500">
                <th className="px-4 py-2.5 font-normal">Релиз</th>
                {TABLE_PLATFORMS.map((platform) => (
                  <th key={platform} className="px-2 py-2.5 font-normal" title={getSmartLinkPlatformLabel(platform)}>
                    <span className="inline-flex items-center gap-1.5">
                      <SmartLinkPlatformIcon code={platform} size={18} />
                      <span className="truncate">{getSmartLinkPlatformLabel(platform).split(" ")[0]}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {overview.rows.map((row) => (
                <tr key={row.releaseId} className="hover:bg-zinc-900/40">
                  <td className="px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <Cover src={row.coverUrl} label={row.title} size={36} />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] text-white">{row.title}</p>
                        <p className="truncate text-xs text-zinc-500">{row.artist} · {formatDate(row.releaseDate)}</p>
                      </div>
                    </div>
                  </td>
                  {TABLE_PLATFORMS.map((platform) => {
                    const cell = row.cells.find((item) => item.platform === platform);
                    return (
                      <td key={platform} className="px-2 py-2.5">
                        {cell ? <CellButton cell={cell} onOpen={() => setMatchDialog({ releaseId: row.releaseId, platform })} /> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {activeCard && profileDialog ? (
        <ProfileDialog card={activeCard} platform={profileDialog.platform} onClose={() => setProfileDialog(null)} onUpdate={setOverview} />
      ) : null}
      {activeRow && activeCell ? (
        <MatchDialog
          key={`${activeRow.releaseId}:${activeCell.platform}:${activeCell.candidates.length}`}
          row={activeRow}
          cell={activeCell}
          onClose={() => setMatchDialog(null)}
          onUpdate={setOverview}
        />
      ) : null}
    </section>
  );
}
