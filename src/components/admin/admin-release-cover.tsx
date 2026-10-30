"use client";

import * as React from "react";

import { resolveRenderableStoredFileUrl } from "@/lib/s3";

/**
 * Cover for an admin release card. The list ships likely URLs without checking storage;
 * this tries them one by one and, if none loads, asks the server for a thorough lookup once.
 */
export function AdminReleaseCover(props: { releaseId: string; title: string; coverUrl: string; candidates?: string[] }) {
  const urls = React.useMemo(() => {
    const all = [props.coverUrl, ...(props.candidates ?? [])]
      .map((value) => (value ? resolveRenderableStoredFileUrl({ url: value, storageKey: null }) ?? value : ""))
      .filter(Boolean);
    return [...new Set(all)];
  }, [props.candidates, props.coverUrl]);
  const [index, setIndex] = React.useState(0);
  const [lookedUp, setLookedUp] = React.useState<string | null | undefined>(undefined);

  React.useEffect(() => {
    setIndex(0);
    setLookedUp(undefined);
  }, [urls]);

  const candidatesExhausted = index >= urls.length;

  React.useEffect(() => {
    if (!candidatesExhausted || lookedUp !== undefined) return;
    let active = true;
    fetch(`/api/admin/releases/${props.releaseId}/cover`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ coverUrl?: string | null }>) : null))
      .then((payload) => {
        if (!active) return;
        const url = payload?.coverUrl ? resolveRenderableStoredFileUrl({ url: payload.coverUrl, storageKey: null }) ?? payload.coverUrl : null;
        setLookedUp(url && !urls.includes(url) ? url : null);
      })
      .catch(() => active && setLookedUp(null));
    return () => {
      active = false;
    };
  }, [candidatesExhausted, lookedUp, props.releaseId, urls]);

  const src = candidatesExhausted ? lookedUp : urls[index];

  if (!src) {
    return (
      <div className="grid h-full w-full place-items-center bg-white/[0.03] text-[11px] text-white/45">
        {candidatesExhausted && lookedUp === undefined ? "…" : "Нет обложки"}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={props.title}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => {
        if (candidatesExhausted) setLookedUp(null);
        else setIndex((current) => current + 1);
      }}
    />
  );
}
