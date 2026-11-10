"use client";

import * as React from "react";

import type { ArtistCommissionRateItem, CommissionReport } from "@/lib/commission-settings";
import { cn } from "@/lib/utils";

interface CommissionState {
  globalPercent: number;
  artists: ArtistCommissionRateItem[];
}

interface FoundUser {
  id: string;
  name: string;
  email: string;
}

const inputClass =
  "mt-2 h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3.5 text-[15px] font-medium text-white outline-none transition-colors focus:border-[#7b3df5]/60";
const primaryButtonClass =
  "rounded-xl border border-[#7b3df5]/45 bg-[#7b3df5]/20 px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#7b3df5]/30 disabled:cursor-not-allowed disabled:opacity-45";

const money = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatRub = (value: number) => `${money.format(value)} ₽`;
const formatPercent = (value: number) => `${String(value).replace(".", ",")}%`;

type PeriodPreset = "all" | "month" | "quarter" | "year" | "custom";

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function presetRange(preset: PeriodPreset): { from: string; to: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (preset === "month") return { from: isoDay(new Date(Date.UTC(year, month, 1))), to: isoDay(now) };
  if (preset === "quarter") {
    return { from: isoDay(new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1))), to: isoDay(now) };
  }
  if (preset === "year") return { from: isoDay(new Date(Date.UTC(year, 0, 1))), to: isoDay(now) };
  return { from: "", to: "" };
}

async function callJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const parsed = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !parsed) throw new Error(parsed?.error ?? "Сервис временно недоступен.");
  return parsed;
}

function Message({ kind, text }: { kind: "error" | "success"; text: string }) {
  return (
    <p
      className={cn(
        "mt-4 rounded-xl border px-4 py-3 text-[13px] font-semibold",
        kind === "error"
          ? "border-rose-400/25 bg-rose-400/10 text-rose-100"
          : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
      )}
    >
      {text}
    </p>
  );
}

export function AdminCommissionClient({
  initialState,
  initialReport
}: {
  initialState: CommissionState;
  initialReport: CommissionReport;
}) {
  const [state, setState] = React.useState(initialState);

  return (
    <div className="mt-6 grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <GlobalRateCard state={state} onState={setState} />
        <ArtistRatesCard state={state} onState={setState} />
      </div>
      <ReportCard initialReport={initialReport} globalPercent={state.globalPercent} artists={state.artists} />
    </div>
  );
}

function GlobalRateCard({ state, onState }: { state: CommissionState; onState: (state: CommissionState) => void }) {
  const [percent, setPercent] = React.useState(String(state.globalPercent).replace(".", ","));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await callJson<{ state: CommissionState }>("/api/admin/finance/commission", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percent })
      });
      onState(result.state);
      setPercent(String(result.state.globalPercent).replace(".", ","));
      setSuccess("Общая ставка сохранена. Она применится к следующим импортам.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить ставку.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#161720] p-5">
      <h2 className="text-[18px] font-semibold text-white">Общая ставка</h2>
      <p className="mt-1 text-[13.5px] leading-relaxed text-white/52">
        Действует для всех артистов, у которых нет индивидуальной ставки.
      </p>
      <p className="mt-4 text-[34px] font-semibold tabular-nums text-white">{formatPercent(state.globalPercent)}</p>
      <label className="mt-3 block text-[13px] font-semibold text-white/70">
        Новая ставка, %
        <input
          inputMode="decimal"
          value={percent}
          onChange={(event) => setPercent(event.target.value)}
          className={inputClass}
          placeholder="10"
        />
      </label>
      {error ? <Message kind="error" text={error} /> : null}
      {success ? <Message kind="success" text={success} /> : null}
      <button type="button" onClick={() => void save()} disabled={busy} className={cn(primaryButtonClass, "mt-4")}>
        {busy ? "Сохранение..." : "Сохранить"}
      </button>
      <p className="mt-4 text-[12px] leading-relaxed text-white/40">
        Уже проведённые импорты не пересчитываются. Если в файле суммы уже за вычетом комиссии, при импорте отметьте
        соответствующую галочку — тогда комиссия не удерживается.
      </p>
    </section>
  );
}

function ArtistRatesCard({ state, onState }: { state: CommissionState; onState: (state: CommissionState) => void }) {
  const [query, setQuery] = React.useState("");
  const [found, setFound] = React.useState<FoundUser[]>([]);
  const [selected, setSelected] = React.useState<FoundUser | null>(null);
  const [percent, setPercent] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    const q = query.trim();
    if (selected || q.length < 2) {
      setFound([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/admin/finance/commission/users?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((parsed: { users?: FoundUser[] }) => setFound(parsed.users ?? []))
        .catch(() => undefined);
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, selected]);

  function pick(user: FoundUser) {
    setSelected(user);
    setQuery(user.name);
    setFound([]);
    const existing = state.artists.find((item) => item.userId === user.id);
    setPercent(existing ? String(existing.percent).replace(".", ",") : "");
    setNotes(existing?.notes ?? "");
  }

  function resetForm() {
    setSelected(null);
    setQuery("");
    setPercent("");
    setNotes("");
  }

  async function save() {
    if (!selected) {
      setError("Найдите и выберите артиста.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await callJson<{ state: CommissionState }>("/api/admin/finance/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id, percent, notes })
      });
      onState(result.state);
      setSuccess(`Ставка для «${selected.name}» сохранена.`);
      resetForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить ставку.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ArtistCommissionRateItem) {
    if (!window.confirm(`Убрать индивидуальную ставку у «${item.userName}»? Будет действовать общая ставка.`)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await callJson<{ state: CommissionState }>(
        `/api/admin/finance/commission?userId=${encodeURIComponent(item.userId)}`,
        { method: "DELETE" }
      );
      onState(result.state);
      setSuccess(`У «${item.userName}» теперь общая ставка.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось убрать ставку.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#161720] p-5">
      <h2 className="text-[18px] font-semibold text-white">Индивидуальные ставки артистов</h2>
      <p className="mt-1 text-[13.5px] leading-relaxed text-white/52">
        Заменяют общую ставку для конкретного артиста. Прошлая ставка сохраняется в истории изменений.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_120px]">
        <label className="relative text-[13px] font-semibold text-white/70">
          Артист (имя или e-mail)
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
            }}
            className={inputClass}
            placeholder="Начните вводить…"
            autoComplete="off"
          />
          {found.length > 0 ? (
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-white/[0.1] bg-[#1d1f2a] py-1 shadow-xl">
              {found.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => pick(user)}
                    className="block w-full px-3.5 py-2 text-left text-[13.5px] font-medium text-white hover:bg-white/[0.06]"
                  >
                    {user.name}
                    <span className="ml-2 text-[12px] font-normal text-white/45">{user.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </label>
        <label className="text-[13px] font-semibold text-white/70">
          Ставка, %
          <input
            inputMode="decimal"
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
            className={inputClass}
            placeholder="5"
          />
        </label>
      </div>
      <label className="mt-3 block text-[13px] font-semibold text-white/70">
        Заметка (видна только админам)
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className={inputClass}
          placeholder="Например: договор от 01.10, крупный артист"
        />
      </label>
      {error ? <Message kind="error" text={error} /> : null}
      {success ? <Message kind="success" text={success} /> : null}
      <button type="button" onClick={() => void save()} disabled={busy || !selected} className={cn(primaryButtonClass, "mt-4")}>
        {busy ? "Сохранение..." : "Сохранить ставку артиста"}
      </button>

      <div className="mt-6 overflow-x-auto">
        {state.artists.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3 text-[13px] text-white/50">
            Индивидуальных ставок нет — у всех артистов общая ставка {formatPercent(state.globalPercent)}.
          </p>
        ) : (
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-white/40">
              <tr>
                <th className="px-3 py-2 font-medium">Артист</th>
                <th className="px-3 py-2 font-medium">Ставка</th>
                <th className="px-3 py-2 font-medium">Заметка</th>
                <th className="px-3 py-2 font-medium">Изменена</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {state.artists.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-white">{item.userName}</div>
                    <div className="text-[12px] text-white/45">{item.userEmail}</div>
                  </td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums text-white">
                    {formatPercent(item.percent)}
                    {item.overriddenByContractPercent !== null ? (
                      <div className="text-[11.5px] font-normal text-amber-200">
                        В импорте действует ставка договора {formatPercent(item.overriddenByContractPercent)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-white/60">{item.notes ?? "—"}</td>
                  <td className="px-3 py-2.5 text-white/50">{new Date(item.updatedAt).toLocaleDateString("ru-RU")}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => pick({ id: item.userId, name: item.userName, email: item.userEmail })}
                      className="mr-3 text-[12.5px] font-semibold text-[#c4b5fd] hover:text-white"
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(item)}
                      className="text-[12.5px] font-semibold text-rose-200 hover:text-white disabled:opacity-45"
                    >
                      Убрать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function ReportCard({
  initialReport,
  globalPercent,
  artists
}: {
  initialReport: CommissionReport;
  globalPercent: number;
  artists: ArtistCommissionRateItem[];
}) {
  const [preset, setPreset] = React.useState<PeriodPreset>("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [report, setReport] = React.useState(initialReport);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const individualByUser = React.useMemo(
    () => new Map(artists.map((item) => [item.userId, item.percent])),
    [artists]
  );

  async function load(range: { from: string; to: string }) {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      const result = await callJson<{ report: CommissionReport }>(`/api/admin/finance/commission/report?${params}`);
      setReport(result.report);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить отчёт.");
    } finally {
      setBusy(false);
    }
  }

  function choosePreset(next: PeriodPreset) {
    setPreset(next);
    if (next === "custom") return;
    const range = presetRange(next);
    setFrom(range.from);
    setTo(range.to);
    void load(range);
  }

  const presets: Array<{ id: PeriodPreset; label: string }> = [
    { id: "all", label: "Всё время" },
    { id: "month", label: "Этот месяц" },
    { id: "quarter", label: "Этот квартал" },
    { id: "year", label: "Этот год" },
    { id: "custom", label: "Свой период" }
  ];

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#161720] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-white">Доходы и выплаты артистам</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-white/52">
            По подтверждённым и не откатанным финансовым импортам, по дате импорта.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => choosePreset(item.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                preset === item.id
                  ? "border-[#7b3df5]/60 bg-[#7b3df5]/25 text-white"
                  : "border-white/[0.1] bg-white/[0.03] text-white/65 hover:text-white"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {preset === "custom" ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-[13px] font-semibold text-white/70">
            С
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} />
          </label>
          <label className="text-[13px] font-semibold text-white/70">
            По
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} />
          </label>
          <button type="button" disabled={busy} onClick={() => void load({ from, to })} className={primaryButtonClass}>
            Показать
          </button>
        </div>
      ) : null}

      {error ? <Message kind="error" text={error} /> : null}

      <div className={cn("mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4", busy && "opacity-50")}>
        <Stat label="Пришло роялти" value={formatRub(report.gross)} />
        <Stat label="Комиссия ICECREAMMUSIC" value={formatRub(report.commission)} tone="amber" />
        <Stat label="Начислено артистам" value={formatRub(report.net)} tone="emerald" />
        <Stat label="Фактическая ставка" value={formatPercent(report.effectivePercent)} />
      </div>

      <div className={cn("mt-5 overflow-x-auto", busy && "opacity-50")}>
        {report.artists.length === 0 ? (
          <p className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3 text-[13px] text-white/50">
            За этот период начислений нет.
          </p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-white/40">
              <tr>
                <th className="px-3 py-2 font-medium">Артист</th>
                <th className="px-3 py-2 text-right font-medium">Пришло</th>
                <th className="px-3 py-2 text-right font-medium">Комиссия</th>
                <th className="px-3 py-2 text-right font-medium">Артисту</th>
                <th className="px-3 py-2 text-right font-medium">Удержано, %</th>
                <th className="px-3 py-2 text-right font-medium">Ставка сейчас</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {report.artists.map((item) => {
                const current = individualByUser.get(item.userId);
                return (
                  <tr key={item.userId}>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-white">{item.userName}</div>
                      <div className="text-[12px] text-white/45">{item.userEmail}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-white/80">{formatRub(item.gross)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-200">{formatRub(item.commission)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-200">{formatRub(item.net)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-white/70">{formatPercent(item.effectivePercent)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-white/70">
                      {current !== undefined ? `${formatPercent(current)} (инд.)` : formatPercent(globalPercent)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" | "emerald" }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-white/40">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-[20px] font-semibold tabular-nums",
          tone === "amber" ? "text-amber-200" : tone === "emerald" ? "text-emerald-200" : "text-white"
        )}
      >
        {value}
      </div>
    </div>
  );
}
