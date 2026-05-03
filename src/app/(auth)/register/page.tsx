"use client";

import * as React from "react";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [created, setCreated] = useState(false);
  const [agree, setAgree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    stageName: "",
    email: "",
    password: ""
  });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agree || loading) return;

    setLoading(true);
    setCreated(false);
    setError("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        if (response.status === 409) {
          setError("Пользователь с таким email уже существует");
        } else if (response.status === 400) {
          setError("Проверьте заполнение полей");
        } else {
          setError(data?.error ?? "Не удалось создать аккаунт");
        }
        return;
      }

      setCreated(true);

      const loginResult = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false
      });

      if (loginResult?.error) {
        router.push("/login");
        router.refresh();
        return;
      }

      const session = await getSession();
      const target = session?.user?.role === "ADMIN" ? "/admin" : "/dashboard";
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

      <h1 className="text-center text-[40px] font-semibold leading-[1.05] tracking-tight text-white sm:text-[48px]">
        Создать аккаунт
      </h1>
      <p className="mx-auto mt-4 max-w-[440px] text-center text-[15px] leading-relaxed text-white/55">
        Дистрибуция, продвижение и аналитика - всё в одном месте за пару минут
      </p>

      <form className="mt-10 space-y-5" onSubmit={onSubmit}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label
              htmlFor="name"
              className="text-[12px] font-medium uppercase tracking-[0.16em] text-white/45"
            >
              Имя
            </Label>
            <Input
              id="name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Valeria Torres"
              className="h-14 rounded-2xl border-0 bg-white/[0.05] px-5 text-[15px] text-white placeholder:text-white/30 focus-visible:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-white/25"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="stageName"
              className="text-[12px] font-medium uppercase tracking-[0.16em] text-white/45"
            >
              Артист / лейбл
            </Label>
            <Input
              id="stageName"
              value={form.stageName}
              onChange={(event) => setForm((prev) => ({ ...prev, stageName: event.target.value }))}
              placeholder="Nova Echo"
              className="h-14 rounded-2xl border-0 bg-white/[0.05] px-5 text-[15px] text-white placeholder:text-white/30 focus-visible:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-white/25"
            />
          </div>
        </div>

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
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="you@domain.com"
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
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="Минимум 8 символов"
            className="h-14 rounded-2xl border-0 bg-white/[0.05] px-5 text-[15px] text-white placeholder:text-white/30 focus-visible:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-white/25"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-[13px] leading-relaxed text-white/65 select-none">
          <span className="relative mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
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
          <span>
            Я принимаю{" "}
            <Link href="#" className="text-white underline-offset-4 hover:underline">
              условия использования
            </Link>{" "}
            и{" "}
            <Link href="#" className="text-white underline-offset-4 hover:underline">
              политику конфиденциальности
            </Link>
          </span>
        </label>

        {error ? (
          <p className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={!agree || loading}
          className="group mt-2 h-14 w-full rounded-2xl bg-white text-[15px] font-semibold text-black shadow-[0_8px_24px_-8px_rgba(255,255,255,0.4)] transition-all hover:bg-white/95 disabled:opacity-50"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Создаем аккаунт...
              </>
            ) : (
              <>
                Создать аккаунт
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </span>
        </Button>
      </form>

      {created ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.08] px-4 py-3.5 text-[13px] text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Аккаунт создан. Выполняем вход...</span>
        </div>
      ) : null}

      <p className="mt-8 text-center text-[14px] text-white/55">
        Уже есть аккаунт?{" "}
        <Link
          href="/login"
          className="font-medium text-white underline-offset-4 transition-colors hover:underline"
        >
          Войти
        </Link>
      </p>
    </div>
  );
}
