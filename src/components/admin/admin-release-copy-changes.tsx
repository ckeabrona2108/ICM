"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import {
  RELEASE_CHANGE_AREA_LABELS,
  changedReleaseAreas,
  type ReleaseChangeArea,
  type ReleaseChangeRequest,
  type ReleaseFieldChange
} from "@/lib/release-copy-changes";
import { cn } from "@/lib/utils";

export interface AdminReleaseCopyChanges {
  request: ReleaseChangeRequest | null;
  changes: ReleaseFieldChange[];
  unmarked_areas: ReleaseChangeArea[];
  source_available: boolean;
}

function CoverPreview({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!src || src === "—") return <span className="text-white/40">—</span>;
  return (
    <figure className="space-y-1">
      {failed ? (
        <a href={src} target="_blank" rel="noreferrer" className="text-sky-200 underline-offset-2 hover:underline">
          Открыть
        </a>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={label}
          onError={() => setFailed(true)}
          className="h-28 w-28 rounded-xl border border-white/[0.08] object-cover"
        />
      )}
      <figcaption className="text-[11px] text-white/45">{label}</figcaption>
    </figure>
  );
}

/** What the artist says they change in an approved release and what actually differs. */
export function AdminReleaseCopyChangesBlock({ value }: { value: AdminReleaseCopyChanges }) {
  const { request, changes, unmarked_areas: unmarked } = value;
  const changed = changedReleaseAreas(changes);

  return (
    <div className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.05] p-4 text-[13px]">
      <p className="text-[11px] uppercase tracking-[0.18em] text-sky-100/60">Что изменилось</p>

      <div className="mt-2 space-y-1">
        <p className="text-white/80">
          <span className="text-white/50">Артист меняет: </span>
          {request && request.areas.length > 0
            ? request.areas.map((area) => RELEASE_CHANGE_AREA_LABELS[area]).join(", ")
            : "не указано"}
        </p>
        {request?.comment ? (
          <p className="text-white/80">
            <span className="text-white/50">Причина: </span>
            {request.comment}
          </p>
        ) : null}
      </div>

      {!value.source_available ? (
        <p className="mt-3 text-white/55">
          Сравнить не удалось: у исходного релиза нет сохранённых данных формы.
        </p>
      ) : changes.length === 0 ? (
        <p className="mt-3 text-amber-100/90">Отличий от опубликованного релиза нет.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {unmarked.length > 0 ? (
            <p className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/[0.08] px-3 py-2 text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Изменено, но артист не отметил:{" "}
              {unmarked.map((area) => RELEASE_CHANGE_AREA_LABELS[area]).join(", ")}
            </p>
          ) : null}
          {changed.map((area) => (
            <div key={area}>
              <p
                className={cn(
                  "font-semibold",
                  unmarked.includes(area) ? "text-amber-100" : "text-white/85"
                )}
              >
                {RELEASE_CHANGE_AREA_LABELS[area]}
              </p>
              <ul className="mt-1 space-y-1.5">
                {changes
                  .filter((change) => change.area === area)
                  .map((change) =>
                    change.kind === "image" ? (
                      <li key={change.field} className="flex flex-wrap items-end gap-4">
                        <CoverPreview src={change.before} label="Было" />
                        <span className="pb-8 text-white/40">→</span>
                        <CoverPreview src={change.after} label="Стало" />
                      </li>
                    ) : (
                      <li key={change.field} className="text-white/70">
                        <span className="text-white/50">{change.label}: </span>
                        <span className="line-through decoration-white/30">{change.before}</span>
                        <span className="px-1.5 text-white/40">→</span>
                        <span className="text-white">{change.after}</span>
                      </li>
                    )
                  )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
