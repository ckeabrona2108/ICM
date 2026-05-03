"use client";

import * as React from "react";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { CabinetRelease } from "@/lib/cabinet-types";
import {
  hasInconsistentListState as resolveInconsistentState,
  normalizePagination
} from "@/lib/releases-list-utils";
import { PageHeader } from "@/components/layout/page-header";
import {
  DashboardEmptyState,
  DashboardShell,
  FilterPanel
} from "@/components/layout/dashboard-shell";

import { ReleaseRowCard } from "./release-row-card";

type SortKey = "createdAt" | "releaseDate" | "title";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "createdAt", label: "Дата создания" },
  { value: "releaseDate", label: "Дата релиза" },
  { value: "title", label: "Название" }
];

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

interface ReleasesListShellProps {
  title: string;
  description?: string;
  releases: CabinetRelease[];
  emptyTitle?: string;
  emptyDescription?: string;
  showNumber?: boolean;
  showPay?: boolean;
  variant?: "default" | "compact";
  allowDraftDelete?: boolean;
}

export function ReleasesListShell({
  title,
  description,
  releases,
  emptyTitle = "Релизы не найдены",
  emptyDescription = "Здесь пока пусто. Создайте новый релиз, чтобы он появился в этой ленте.",
  showNumber = false,
  showPay = true,
  variant = "compact",
  allowDraftDelete = false
}: ReleasesListShellProps) {
  const [query, setQuery] = React.useState("");
  const [platform, setPlatform] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [createdDate, setCreatedDate] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("createdAt");
  const [perPage, setPerPage] = React.useState(20);
  const [page, setPage] = React.useState(1);
  const isDraftSection = title.toLowerCase().includes("чернов");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = releases.slice();
    if (q) {
      list = list.filter((r) => {
        const fields = [
          r.title,
          r.artist,
          r.upc,
          r.isrc,
          r.label,
          r.genre,
          r.status,
          !r.paid ? "не оплачен" : ""
        ]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase());
        return fields.some((f) => f.includes(q));
      });
    }
    if (platform) {
      const normalizedPlatform = platform.toLowerCase();
      list = list.filter((r) => r.platforms.toLowerCase().includes(normalizedPlatform));
    }
    if (startDate) list = list.filter((r) => r.startDate === startDate);
    if (createdDate) list = list.filter((r) => r.createdAt === createdDate);

    list.sort((a, b) => {
      if (sort === "title") {
        return (a.title ?? "").localeCompare(b.title ?? "");
      }
      const ka = (a[sort] as string) ?? "";
      const kb = (b[sort] as string) ?? "";
      return kb.localeCompare(ka);
    });
    return list;
  }, [releases, query, platform, startDate, createdDate, sort]);

  const total = filtered.length;
  const paging = normalizePagination({ total, page, perPage });
  const totalPages = paging.totalPages;
  const safePage = paging.safePage;
  const safePerPage = paging.safePerPage;
  const pageItems = filtered.slice(paging.start, paging.end);
  const hasInconsistentListState = resolveInconsistentState({
    total,
    visibleItemsCount: pageItems.length
  });
  const renderedCards = React.useMemo(
    () =>
      pageItems.map((r, i) => (
        <ReleaseRowCard
          key={r.id}
          release={r}
          index={i}
          showNumber={showNumber}
          showPay={showPay}
          variant={variant}
          allowDraftDelete={allowDraftDelete}
        />
      )),
    [allowDraftDelete, pageItems, showNumber, showPay, variant]
  );

  React.useEffect(() => {
    setPage(1);
  }, [query, platform, startDate, createdDate, perPage]);

  React.useEffect(() => {
    setQuery("");
    setPlatform("");
    setStartDate("");
    setCreatedDate("");
    setSort("createdAt");
    setPerPage(20);
    setPage(1);
  }, [title]);

  React.useEffect(() => {
    if (!hasInconsistentListState) return;
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[releases-list] inconsistent pagination state", {
        title,
        total,
        pageItems: pageItems.length,
        page,
        perPage
      });
    }
    if (safePerPage !== perPage) setPerPage(20);
    if (safePage !== 1) setPage(1);
  }, [hasInconsistentListState, page, pageItems.length, perPage, safePage, safePerPage, title, total]);

  const resetFilters = () => {
    setQuery("");
    setPlatform("");
    setStartDate("");
    setCreatedDate("");
    setSort("createdAt");
    setPerPage(20);
    setPage(1);
  };

  const filtersActive = Boolean(query || platform || startDate || createdDate);

  return (
    <DashboardShell>
      <PageHeader title={title} description={description} />

      {/* filters bar */}
      <FilterPanel>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по UPC, ISRC, треку, исполнителю, лейблу, коду партнёра"
            className="h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 pl-10 pr-3.5 text-[15px] font-medium text-white placeholder:text-white/45 outline-none transition-colors focus:border-[#7b3df5]/60 focus:bg-white/[0.04]"
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <SelectInput
            value={platform}
            onChange={setPlatform}
            options={[
              { value: "", label: "Все площадки" },
              { value: "spotify", label: "Spotify" },
              { value: "apple", label: "Apple Music" },
              { value: "yandex", label: "Яндекс Музыка" },
              { value: "vk", label: "VK Музыка" },
              { value: "youtube", label: "YouTube Music" }
            ]}
            disabled={isDraftSection}
          />
          <DateInput value={startDate} onChange={setStartDate} placeholder="Дата старта" />
          <DateInput value={createdDate} onChange={setCreatedDate} placeholder="Дата создания" />
        </div>

        {filtersActive ? (
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={resetFilters}
              className="text-[12px] text-white/55 underline-offset-2 transition-colors hover:text-white hover:underline"
            >
              Сбросить фильтры
            </button>
          </div>
        ) : null}
      </FilterPanel>

      {/* meta + sort */}
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 className="text-[22px] font-semibold text-white">
          Всего релизов: <span className="text-white/85">{total}</span>
        </h2>

        <div className="ml-auto flex flex-wrap items-center gap-4 text-[14px] font-medium text-white/65">
          <DropdownButton
            icon={<SlidersHorizontal className="h-3 w-3" />}
            label="Сортировать по"
            value={SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Дата создания"}
            options={SORT_OPTIONS}
            onSelect={(v) => setSort(v as SortKey)}
          />
          <DropdownButton
            label="Показывать по"
            value={String(perPage)}
            options={PER_PAGE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
            onSelect={(v) => setPerPage(Number(v))}
          />
        </div>
      </div>

      {/* list */}
      {total === 0 ? (
        <DashboardEmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="space-y-4">
          {hasInconsistentListState ? (
            <div className="rounded-xl border border-amber-300/25 bg-amber-500/10 p-4 text-[14px] text-amber-100">
              <p className="font-medium">Данные есть, но список не отображается из-за состояния фильтров/страницы.</p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-2 rounded-lg border border-amber-200/30 px-3 py-1.5 text-[12px] font-semibold text-amber-50 transition-colors hover:bg-amber-200/10"
              >
                Сбросить фильтры
              </button>
            </div>
          ) : (
            renderedCards
          )}
        </div>
      )}

      {/* pagination */}
      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-2">
          <PageBtn disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </PageBtn>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <PageBtn key={p} active={p === safePage} onClick={() => setPage(p)}>
              {p}
            </PageBtn>
          ))}
          <PageBtn disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </PageBtn>
        </div>
      ) : null}
    </DashboardShell>
  );
}

function SelectInput({
  value,
  onChange,
  options,
  disabled = false
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "h-11 w-full appearance-none rounded-xl border border-white/[0.12] bg-black/25 px-3.5 pr-9 text-[15px] font-medium outline-none transition-colors focus:border-[#7b3df5]/60",
          value ? "text-white" : "text-white/45",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#13141a]">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
    </div>
  );
}

function DateInput({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "icm-date-input h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3.5 pr-9 text-[15px] font-medium outline-none transition-colors focus:border-[#7b3df5]/60",
          value ? "text-white" : "text-white/45"
        )}
      />
      <Calendar className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
    </div>
  );
}

function DropdownButton({
  icon,
  label,
  value,
  options,
  onSelect
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-1.5 transition-colors hover:text-white"
      >
        {icon}
        <span>{label}:</span>
        <span className="font-medium text-[#a78bfa]">{value}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-white/[0.08] bg-[#171821] shadow-xl">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onSelect(o.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center px-3 py-2 text-left text-[12.5px] transition-colors",
                o.value === value
                  ? "bg-[#7b3df5]/15 text-white"
                  : "text-white/75 hover:bg-white/[0.04] hover:text-white"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PageBtn({
  active,
  disabled,
  onClick,
  children
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid h-9 min-w-9 place-items-center rounded-lg px-2 text-[14px] font-semibold transition-colors",
        active
          ? "bg-[#7b3df5] text-white"
          : "bg-white/[0.03] text-white/65 hover:bg-white/[0.08] hover:text-white",
        disabled && "cursor-not-allowed opacity-30 hover:bg-white/[0.03]"
      )}
    >
      {children}
    </button>
  );
}
