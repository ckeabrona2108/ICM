"use client";

import * as React from "react";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [remember, setRemember] = useState(true);
  const [form, setForm] = useState({ email: "", password: "" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false
      });

      if (result?.error) {
        setError("Неверный email или пароль");
        return;
      }

      let target = "/dashboard";
      try {
        const session = await getSession();
        target = session?.user?.role === "ADMIN" ? "/admin" : "/dashboard";
      } catch {
        // getSession can fail on transient network issues; continue with safe fallback.
      }

      router.push(target);
      router.refresh();
    } catch {
      setError("Ошибка сети. Попробуйте снова");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[560px]">
      {/* Brand */}
      <div className="mb-12 flex justify-center">
        <Link href="/" className="flex items-center">
          <Image
            src="/brand/logo.png"
            alt="ICM Music Cloud"
            width={317}
            height={400}
            priority
            className="h-12 w-auto object-contain"
          />
        </Link>
      </div>

      {/* Title */}
      <h1 className="text-center text-[40px] font-semibold leading-[1.05] tracking-tight text-white sm:text-[48px]">
        С возвращением
      </h1>
      <p className="mx-auto mt-4 max-w-[420px] text-center text-[15px] leading-relaxed text-white/55">
        Войдите в аккаунт, чтобы продолжить работу с релизами и аналитикой
      </p>

      {/* Form */}
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
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            className="h-14 rounded-2xl border-0 bg-white/[0.05] px-5 text-[15px] text-white placeholder:text-white/30 focus-visible:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-white/25"
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="password"
            className="text-[12px] font-medium uppercase tracking-[0.16em] text-white/45"
          >
            Пароль
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="Введите пароль"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            className="h-14 rounded-2xl border-0 bg-white/[0.05] px-5 text-[15px] text-white placeholder:text-white/30 focus-visible:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-white/25"
          />
        </div>

        {/* Remember + forgot */}
        <div className="flex items-center justify-between pt-1">
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-[13.5px] text-white/70 select-none">
            <span className="relative flex h-[18px] w-[18px] items-center justify-center">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="peer absolute inset-0 cursor-pointer appearance-none rounded-md border border-white/20 bg-white/[0.04] transition-colors checked:border-white checked:bg-white"
              />
              <svg
                className="pointer-events-none h-3 w-3 text-black opacity-0 peer-checked:opacity-100"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            Запомнить меня
          </label>
          <Link
            href="#"
            className="text-[13.5px] text-white/55 transition-colors hover:text-white"
          >
            Забыли пароль?
          </Link>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
            {error}
          </p>
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
                Входим…
              </>
            ) : (
              <>
                Войти
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </span>
        </Button>
      </form>

      <p className="mt-8 text-center text-[14px] text-white/55">
        Нет аккаунта?{" "}
        <Link
          href="/register"
          className="font-medium text-white underline-offset-4 transition-colors hover:underline"
        >
          Создать
        </Link>
      </p>

    </div>
  );
}
