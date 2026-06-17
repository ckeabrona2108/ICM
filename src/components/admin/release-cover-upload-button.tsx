"use client";

import * as React from "react";
import { Loader2, Upload } from "lucide-react";

type UploadResponse = {
  ok?: boolean;
  error?: string;
  previewUrl?: string;
  storageKey?: string;
};

const ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif";

export function ReleaseCoverUploadButton(props: {
  releaseId: string;
  label: string;
  className?: string;
  onUploaded?: (payload: { previewUrl: string; storageKey: string }) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const openPicker = () => {
    if (loading) return;
    inputRef.current?.click();
  };

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`/api/admin/releases/${props.releaseId}/cover`, {
      method: "POST",
      body: formData
    });
    const payload = (await response.json().catch(() => null)) as UploadResponse | null;
    if (!response.ok || !payload?.previewUrl || !payload.storageKey) {
      throw new Error(payload?.error ?? "Не удалось обновить обложку.");
    }

    props.onUploaded?.({ previewUrl: payload.previewUrl, storageKey: payload.storageKey });
    setSuccess("Обложка обновлена");
  };

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) {
      setError("Файл не выбран.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const allowedExt = ["jpg", "jpeg", "png", "webp", "gif"];
      const allowedMime = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowedExt.includes(ext) || !allowedMime.includes(file.type)) {
        throw new Error("Разрешены только .jpg, .jpeg, .png, .webp, .gif.");
      }
      if (file.size <= 0) {
        throw new Error("Файл не выбран.");
      }
      if (file.size > 15 * 1024 * 1024) {
        throw new Error("Файл слишком большой. Максимум 15 MB.");
      }
      await uploadFile(file);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось обновить обложку.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={props.className}>
      <button
        type="button"
        onClick={openPicker}
        disabled={loading}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-indigo-300/30 bg-indigo-500/15 px-3 text-[13px] font-semibold text-indigo-100 transition hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {props.label}
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={onChange} />
      {error ? <p className="mt-2 text-[12px] text-rose-300">{error}</p> : null}
      {success ? <p className="mt-2 text-[12px] text-emerald-300">{success}</p> : null}
    </div>
  );
}
