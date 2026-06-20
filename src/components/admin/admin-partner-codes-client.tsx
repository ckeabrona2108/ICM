"use client";

import * as React from "react";

import type { PartnerCodeListItem } from "@/lib/partner-codes";

type FormState = {
  code: string;
  label: string;
  active: boolean;
  coversReleasePayment: boolean;
  maxUses: string;
  expiresAt: string;
  allowedUserId: string;
  allowedEmailDomain: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  code: "",
  label: "",
  active: true,
  coversReleasePayment: true,
  maxUses: "",
  expiresAt: "",
  allowedUserId: "",
  allowedEmailDomain: "",
  notes: ""
};

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function fromItem(item: PartnerCodeListItem): FormState {
  return {
    code: item.code,
    label: item.label ?? "",
    active: item.active,
    coversReleasePayment: item.coversReleasePayment,
    maxUses: item.maxUses == null ? "" : String(item.maxUses),
    expiresAt: toDateInputValue(item.expiresAt),
    allowedUserId: item.allowedUserId ?? "",
    allowedEmailDomain: item.allowedEmailDomain ?? "",
    notes: item.notes ?? ""
  };
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}

function buildPayload(form: FormState) {
  return {
    code: form.code,
    label: form.label || null,
    active: form.active,
    coversReleasePayment: form.coversReleasePayment,
    maxUses: form.maxUses.trim() ? Number(form.maxUses) : null,
    expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
    allowedUserId: form.allowedUserId.trim() || null,
    allowedEmailDomain: form.allowedEmailDomain.trim() || null,
    notes: form.notes.trim() || null
  };
}

export function AdminPartnerCodesClient({
  initialItems
}: {
  initialItems: PartnerCodeListItem[];
}) {
  const [items, setItems] = React.useState(initialItems);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/partner-codes", { method: "GET" });
      const payload = (await response.json().catch(() => null)) as
        | { items?: PartnerCodeListItem[]; error?: string }
        | null;
      if (!response.ok || !payload?.items) {
        throw new Error(payload?.error ?? "Не удалось загрузить партнёрские коды.");
      }
      setItems(payload.items);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Не удалось загрузить партнёрские коды."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const url = editingId
        ? `/api/admin/partner-codes/${editingId}`
        : "/api/admin/partner-codes";
      const method = editingId ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form))
      });
      const payload = (await response.json().catch(() => null)) as
        | { item?: PartnerCodeListItem; error?: string }
        | null;
      if (!response.ok || !payload?.item) {
        throw new Error(payload?.error ?? "Не удалось сохранить партнёрский код.");
      }

      await reload();
      setForm(EMPTY_FORM);
      setEditingId(null);
      setToast(editingId ? "Код обновлён." : "Код создан.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось сохранить партнёрский код."
      );
    } finally {
      setLoading(false);
    }
  }

  function startEdit(item: PartnerCodeListItem) {
    setEditingId(item.id);
    setForm(fromItem(item));
    setError(null);
  }

  async function toggleActive(item: PartnerCodeListItem) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/partner-codes/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active })
      });
      const payload = (await response.json().catch(() => null)) as
        | { item?: PartnerCodeListItem; error?: string }
        | null;
      if (!response.ok || !payload?.item) {
        throw new Error(payload?.error ?? "Не удалось изменить статус кода.");
      }
      await reload();
      setToast(payload.item.active ? "Код активирован." : "Код отключён.");
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : "Не удалось изменить статус кода."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-2xl border border-white/10 bg-[#14151d] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-white">
              {editingId ? "Редактирование кода" : "Новый код"}
            </h2>
            <p className="mt-1 text-[13px] text-white/60">
              Код можно ограничить по сроку, лимиту использований, конкретному пользователю или
              домену email.
            </p>
          </div>
          {editingId ? (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
                setError(null);
              }}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12px] font-medium text-white/80"
            >
              Сбросить
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1 text-[12px] text-white/65">
            <span>Код</span>
            <input
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
              className="w-full rounded-lg border border-white/12 bg-black/20 px-3 py-2 text-[14px] text-white outline-none"
              placeholder="PARTNER-001"
            />
          </label>
          <label className="space-y-1 text-[12px] text-white/65">
            <span>Лейбл</span>
            <input
              value={form.label}
              onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
              className="w-full rounded-lg border border-white/12 bg-black/20 px-3 py-2 text-[14px] text-white outline-none"
              placeholder="Приглашение для партнёра"
            />
          </label>
          <label className="space-y-1 text-[12px] text-white/65">
            <span>Лимит использований</span>
            <input
              value={form.maxUses}
              onChange={(event) => setForm((prev) => ({ ...prev, maxUses: event.target.value }))}
              className="w-full rounded-lg border border-white/12 bg-black/20 px-3 py-2 text-[14px] text-white outline-none"
              placeholder="пусто = без лимита"
            />
          </label>
          <label className="space-y-1 text-[12px] text-white/65">
            <span>Истекает</span>
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(event) => setForm((prev) => ({ ...prev, expiresAt: event.target.value }))}
              className="w-full rounded-lg border border-white/12 bg-black/20 px-3 py-2 text-[14px] text-white outline-none"
            />
          </label>
          <label className="space-y-1 text-[12px] text-white/65">
            <span>allowedUserId</span>
            <input
              value={form.allowedUserId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, allowedUserId: event.target.value }))
              }
              className="w-full rounded-lg border border-white/12 bg-black/20 px-3 py-2 text-[14px] text-white outline-none"
              placeholder="UUID пользователя"
            />
          </label>
          <label className="space-y-1 text-[12px] text-white/65">
            <span>allowedEmailDomain</span>
            <input
              value={form.allowedEmailDomain}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, allowedEmailDomain: event.target.value }))
              }
              className="w-full rounded-lg border border-white/12 bg-black/20 px-3 py-2 text-[14px] text-white outline-none"
              placeholder="label.com"
            />
          </label>
        </div>

        <label className="mt-4 block space-y-1 text-[12px] text-white/65">
          <span>Заметка</span>
          <textarea
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            className="min-h-[96px] w-full rounded-lg border border-white/12 bg-black/20 px-3 py-2 text-[14px] text-white outline-none"
            placeholder="Для кого предназначен код и как его использовать"
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-4 text-[13px] text-white/75">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
            />
            Активен
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.coversReleasePayment}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, coversReleasePayment: event.target.checked }))
              }
            />
            Покрывает оплату релиза
          </label>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[13px] text-rose-200">
            {error}
          </div>
        ) : null}
        {toast ? (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[13px] text-emerald-200">
            {toast}
          </div>
        ) : null}

        <div className="mt-4">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              void submit();
            }}
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/15 disabled:opacity-60"
          >
            {editingId ? "Сохранить изменения" : "Создать код"}
          </button>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-white/10 bg-[#14151d]">
        <table className="min-w-full text-left text-[13px] text-white/85">
          <thead className="bg-white/[0.03] text-white/60">
            <tr>
              <th className="px-3 py-2">Код</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2">Ограничения</th>
              <th className="px-3 py-2">Использовано</th>
              <th className="px-3 py-2">Последние применения</th>
              <th className="px-3 py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-white/65">
                  Загружаем коды...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-white/65">
                  Партнёрских кодов пока нет.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-white/10 align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium text-white">{item.code}</div>
                    <div className="mt-1 text-[11px] text-white/45">{item.label ?? "—"}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{item.active ? "Активен" : "Отключён"}</div>
                    <div className="mt-1 text-[11px] text-white/45">
                      {item.coversReleasePayment ? "Покрывает оплату" : "Только справочный"}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div>expires: {formatDate(item.expiresAt)}</div>
                    <div className="mt-1 text-[11px] text-white/45">
                      maxUses: {item.maxUses ?? "∞"}
                    </div>
                    <div className="mt-1 text-[11px] text-white/45">
                      user: {item.allowedUserEmail ?? item.allowedUserId ?? "—"}
                    </div>
                    <div className="mt-1 text-[11px] text-white/45">
                      domain: {item.allowedEmailDomain ?? "—"}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {item.usedCount}
                    {item.maxUses != null ? ` / ${item.maxUses}` : ""}
                  </td>
                  <td className="px-3 py-3">
                    {item.usages.length === 0 ? (
                      <span className="text-white/45">Нет применений</span>
                    ) : (
                      <div className="space-y-2">
                        {item.usages.slice(0, 3).map((usage) => (
                          <div key={usage.id} className="text-[11px] text-white/70">
                            <div>{usage.userEmail ?? usage.userId}</div>
                            <div className="text-white/45">
                              {usage.releaseTitle ?? usage.releaseId} · {formatDate(usage.createdAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/85"
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void toggleActive(item);
                        }}
                        className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/85"
                      >
                        {item.active ? "Отключить" : "Включить"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
