"use client";

import * as React from "react";

type ReleaseOption = {
  id: string;
  title: string;
  upc: string | null;
  user: {
    name: string;
    email: string;
  };
};

type UnmatchedItem = {
  id: string;
  upc: string;
  artistName: string | null;
  albumName: string | null;
  trackName: string | null;
  country: string;
  streams: number;
  payStreams: number;
  sourceFileName: string;
  reportDate: string;
  reason: string;
  createdAt: string;
  resolved: boolean;
  resolvedReleaseId: string | null;
};

interface Filters {
  upc: string;
  artist: string;
  album: string;
  reportDate: string;
  sourceFileName: string;
}

const fieldClass =
  "h-10 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[13px] text-white outline-none focus:border-[#7b3df5]/60";

export function AdminAnalyticsUnmatchedClient({
  releaseOptions
}: {
  releaseOptions: ReleaseOption[];
}) {
  const [filters, setFilters] = React.useState<Filters>({
    upc: "",
    artist: "",
    album: "",
    reportDate: "",
    sourceFileName: ""
  });
  const [items, setItems] = React.useState<UnmatchedItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedReleaseByRow, setSelectedReleaseByRow] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.upc.trim()) params.set("upc", filters.upc.trim());
      if (filters.artist.trim()) params.set("artist", filters.artist.trim());
      if (filters.album.trim()) params.set("album", filters.album.trim());
      if (filters.reportDate.trim()) params.set("report_date", filters.reportDate.trim());
      if (filters.sourceFileName.trim()) params.set("source_file_name", filters.sourceFileName.trim());

      const response = await fetch(`/api/admin/analytics/unmatched?${params.toString()}`, {
        method: "GET"
      });

      const payload = (await response.json().catch(() => null)) as
        | { items?: UnmatchedItem[]; error?: string }
        | null;

      if (!response.ok || !payload?.items) {
        throw new Error(payload?.error ?? "Не удалось загрузить unmatched rows");
      }

      setItems(payload.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить unmatched rows");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function linkRow(rowId: string) {
    const releaseId = selectedReleaseByRow[rowId]?.trim();
    if (!releaseId) return;

    setError(null);
    try {
      const response = await fetch(`/api/admin/analytics/unmatched/${rowId}/link-release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_id: releaseId })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось привязать строку");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось привязать строку");
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <section className="rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
        <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">
          Unmatched UPC
        </h1>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <input
            className={fieldClass}
            placeholder="UPC"
            value={filters.upc}
            onChange={(e) => setFilters((prev) => ({ ...prev, upc: e.target.value }))}
          />
          <input
            className={fieldClass}
            placeholder="Artist"
            value={filters.artist}
            onChange={(e) => setFilters((prev) => ({ ...prev, artist: e.target.value }))}
          />
          <input
            className={fieldClass}
            placeholder="Album"
            value={filters.album}
            onChange={(e) => setFilters((prev) => ({ ...prev, album: e.target.value }))}
          />
          <input
            type="date"
            className={fieldClass}
            value={filters.reportDate}
            onChange={(e) => setFilters((prev) => ({ ...prev, reportDate: e.target.value }))}
          />
          <input
            className={fieldClass}
            placeholder="source_file_name"
            value={filters.sourceFileName}
            onChange={(e) => setFilters((prev) => ({ ...prev, sourceFileName: e.target.value }))}
          />
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="text-white/55">
              <tr>
                <th className="px-2 py-2">upc</th>
                <th className="px-2 py-2">artist_name</th>
                <th className="px-2 py-2">album_name</th>
                <th className="px-2 py-2">track_name</th>
                <th className="px-2 py-2">country</th>
                <th className="px-2 py-2">streams</th>
                <th className="px-2 py-2">pay_streams</th>
                <th className="px-2 py-2">source_file_name</th>
                <th className="px-2 py-2">report_date</th>
                <th className="px-2 py-2">reason</th>
                <th className="px-2 py-2">created_at</th>
                <th className="px-2 py-2">action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-white/10">
                  <td className="px-2 py-2">{item.upc || "—"}</td>
                  <td className="px-2 py-2">{item.artistName || "—"}</td>
                  <td className="px-2 py-2">{item.albumName || "—"}</td>
                  <td className="px-2 py-2">{item.trackName || "—"}</td>
                  <td className="px-2 py-2">{item.country}</td>
                  <td className="px-2 py-2">{item.streams}</td>
                  <td className="px-2 py-2">{item.payStreams}</td>
                  <td className="px-2 py-2">{item.sourceFileName}</td>
                  <td className="px-2 py-2">{item.reportDate.slice(0, 10)}</td>
                  <td className="px-2 py-2">{item.reason}</td>
                  <td className="px-2 py-2">{new Date(item.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="px-2 py-2">
                    {item.resolved ? (
                      <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                        resolved
                      </span>
                    ) : (
                      <div className="min-w-[240px] space-y-1.5">
                        <input
                          list={`release-options-${item.id}`}
                          placeholder="release_id"
                          className="h-8 w-full rounded-md border border-white/15 bg-black/25 px-2 text-[12px] text-white outline-none"
                          value={selectedReleaseByRow[item.id] ?? ""}
                          onChange={(e) =>
                            setSelectedReleaseByRow((prev) => ({
                              ...prev,
                              [item.id]: e.target.value
                            }))
                          }
                        />
                        <datalist id={`release-options-${item.id}`}>
                          {releaseOptions.map((release) => (
                            <option
                              key={release.id}
                              value={release.id}
                              label={`${release.title} · UPC: ${release.upc || "—"} · ${release.user.name}`}
                            />
                          ))}
                        </datalist>
                        <button
                          type="button"
                          onClick={() => {
                            void linkRow(item.id);
                          }}
                          className="w-full rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/85 hover:bg-white/10"
                        >
                          Link to release
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-2 py-6 text-center text-white/60">
                    Нет unmatched строк.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
