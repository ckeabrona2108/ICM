import Link from "next/link";

interface ImportDetailsProps {
  details: {
    job: {
      id: string;
      sourceFileName: string;
      reportDate: Date;
      status: string;
      totalRows: number;
      importedRows: number;
      matchedRows: number;
      unmatchedRows: number;
      affectedUsersCount: number;
      affectedReleasesCount: number;
      errorMessage: string | null;
      createdAt: Date;
      startedAt: Date | null;
      finishedAt: Date | null;
      storedFilePath: string | null;
    };
    unmatchedRows: Array<{
      id: string;
      upc: string;
      artistName: string | null;
      albumName: string | null;
      trackName: string | null;
      country: string;
      streams: number;
      payStreams: number;
      reason: string;
      createdAt: Date;
      resolved: boolean;
    }>;
    users: Array<{ id: string; name: string; email: string }>;
    releases: Array<{
      id: string;
      title: string;
      upc: string | null;
      userId: string;
      user: { name: string };
    }>;
  };
}

export function AdminAnalyticsImportDetails({ details }: ImportDetailsProps) {
  const { job } = details;

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[24px] font-semibold text-white">Import details</h1>
          <Link
            href="/admin/analytics"
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] font-semibold text-white/85 hover:bg-white/10"
          >
            Назад к истории
          </Link>
        </div>

        <div className="mt-4 grid gap-2 text-[13px] text-white/80 sm:grid-cols-2 lg:grid-cols-3">
          <p>id: {job.id}</p>
          <p>source_file_name: {job.sourceFileName}</p>
          <p>report_date: {job.reportDate.toISOString().slice(0, 10)}</p>
          <p>status: {job.status.toLowerCase()}</p>
          <p>total_rows: {job.totalRows}</p>
          <p>imported_rows: {job.importedRows}</p>
          <p>matched_rows: {job.matchedRows}</p>
          <p>unmatched_rows: {job.unmatchedRows}</p>
          <p>affected_users_count: {job.affectedUsersCount}</p>
          <p>affected_releases_count: {job.affectedReleasesCount}</p>
          <p>started_at: {job.startedAt ? job.startedAt.toISOString() : "—"}</p>
          <p>finished_at: {job.finishedAt ? job.finishedAt.toISOString() : "—"}</p>
          <p>created_at: {job.createdAt.toISOString()}</p>
          <p className="sm:col-span-2 lg:col-span-3">error_message: {job.errorMessage || "—"}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
        <h2 className="text-[18px] font-semibold text-white">Unmatched rows</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="text-white/55">
              <tr>
                <th className="px-2 py-2">upc</th>
                <th className="px-2 py-2">artist</th>
                <th className="px-2 py-2">album</th>
                <th className="px-2 py-2">track</th>
                <th className="px-2 py-2">country</th>
                <th className="px-2 py-2">streams</th>
                <th className="px-2 py-2">pay_streams</th>
                <th className="px-2 py-2">reason</th>
                <th className="px-2 py-2">resolved</th>
              </tr>
            </thead>
            <tbody>
              {details.unmatchedRows.map((row) => (
                <tr key={row.id} className="border-t border-white/10">
                  <td className="px-2 py-2">{row.upc || "—"}</td>
                  <td className="px-2 py-2">{row.artistName || "—"}</td>
                  <td className="px-2 py-2">{row.albumName || "—"}</td>
                  <td className="px-2 py-2">{row.trackName || "—"}</td>
                  <td className="px-2 py-2">{row.country}</td>
                  <td className="px-2 py-2">{row.streams}</td>
                  <td className="px-2 py-2">{row.payStreams}</td>
                  <td className="px-2 py-2">{row.reason}</td>
                  <td className="px-2 py-2">{row.resolved ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
        <h2 className="text-[18px] font-semibold text-white">Затронутые пользователи</h2>
        <ul className="mt-3 space-y-1 text-[13px] text-white/80">
          {details.users.map((user) => (
            <li key={user.id}>
              {user.name} ({user.email}) · {user.id}
            </li>
          ))}
          {details.users.length === 0 ? <li className="text-white/55">Нет данных</li> : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
        <h2 className="text-[18px] font-semibold text-white">Затронутые релизы</h2>
        <ul className="mt-3 space-y-1 text-[13px] text-white/80">
          {details.releases.map((release) => (
            <li key={release.id}>
              {release.title} · UPC: {release.upc || "—"} · user: {release.user.name} · {release.id}
            </li>
          ))}
          {details.releases.length === 0 ? <li className="text-white/55">Нет данных</li> : null}
        </ul>
      </section>
    </div>
  );
}
