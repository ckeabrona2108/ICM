"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");
    setSuccess("");
    setPreviewUrl(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; message?: string; previewUrl?: string | null }
        | null;

      if (!response.ok) {
        setError(payload?.error ?? "Не удалось отправить инструкцию.");
        return;
      }

      setSuccess(
        payload?.message ??
          "Если аккаунт существует, инструкция по восстановлению отправлена."
      );
      setPreviewUrl(payload?.previewUrl ?? null);
    } catch {
      setError("Ошибка сети. Попробуйте снова.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[560px]">
      <div className="mb-12 flex justify-center">
        <Link href="/" className="flex items-center">
          <Image
            src="/brand/logo.png"
            alt="ICECREAMMUSIC"
            width={317}
            height={400}
            priority
            className="h-12 w-auto object-contain"
          />
        </Link>
      </div>

      <h1 className="text-center text-[40px] font-semibold leading-[1.05] tracking-tight text-white sm:text-[48px]">
        Восстановление пароля
      </h1>
      <p className="mx-auto mt-4 max-w-[460px] text-center text-[15px] leading-relaxed text-white/55">
        Укажите email аккаунта. Мы отправим ссылку для сброса пароля.
      </p>

      <form className="mt-10 space-y-5" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label
            htmlFor="email"
            className="text-[12px] font-medium uppercase tracking-[0.16em] text-white/45"
          >
            Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@domain.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-14 rounded-2xl border-0 bg-white/[0.05] px-5 text-[15px] text-white placeholder:text-white/30 focus-visible:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-white/25"
          />
        </div>

        {error ? (
          <p className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
            {error}
          </p>
        ) : null}

        {success ? (
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-100">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-2">
                <p>{success}</p>
                {previewUrl ? (
                  <p className="text-emerald-100/80">
                    Локальный режим:{" "}
                    <a
                      href={previewUrl}
                      className="font-semibold text-white underline underline-offset-4"
                    >
                      открыть ссылку восстановления
                    </a>
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <Button
          type="submit"
          disabled={loading}
          className="group mt-2 h-14 w-full rounded-2xl bg-white text-[15px] font-semibold text-black shadow-[0_8px_24px_-8px_rgba(255,255,255,0.4)] transition-all hover:bg-white/95 disabled:opacity-60"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Отправляем…
              </>
            ) : (
              <>
                Отправить ссылку
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </span>
        </Button>
      </form>

      <p className="mt-8 text-center text-[14px] text-white/55">
        Вспомнили пароль?{" "}
        <Link
          href="/login"
          className="font-medium text-white underline-offset-4 transition-colors hover:underline"
        >
          Вернуться ко входу
        </Link>
      </p>
    </div>
  );
}

