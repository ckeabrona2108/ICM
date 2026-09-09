"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, Sparkles, Waves } from "lucide-react";

import { cn } from "@/lib/utils";

export const authLabelClassName =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44";

export const authInputClassName =
  "h-12 rounded-[18px] border-white/[0.12] bg-white/[0.035] px-4 text-[15px] text-white placeholder:text-white/30 focus-visible:border-[#8b72ff]/55 focus-visible:bg-white/[0.05] focus-visible:ring-[#8b72ff]/35";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,0.94fr)_minmax(420px,540px)] lg:items-stretch">
      <section className="ux-surface relative hidden overflow-hidden rounded-[32px] p-8 lg:flex lg:min-h-[720px] lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-x-[-8%] top-[-18%] h-72 rounded-full bg-[#7b61ff]/16 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-12%] left-[-8%] h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-3 text-white">
            <span className="ux-surface-soft inline-flex h-12 w-12 items-center justify-center rounded-2xl p-2">
              <Image
                src="/brand/logo.png"
                alt="ICECREAMMUSIC"
                width={64}
                height={80}
                priority
                className="h-8 w-auto object-contain"
              />
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.26em] text-white/62">
              Icecreammusic
            </span>
          </Link>
        </div>

        <div className="relative max-w-[520px]">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#c7bcff]">
            {eyebrow}
          </p>
          <h1 className="max-w-[12ch] text-[46px] font-semibold leading-[0.98] tracking-[-0.05em] text-white">
            {title}
          </h1>
          <p className="mt-5 max-w-[46ch] text-[16px] leading-7 text-white/64">
            {description}
          </p>

          <div className="mt-8 grid gap-3">
            <FeaturePill icon={Sparkles} title="Один продукт" text="Публичный сайт, вход и кабинет работают в едином visual language." />
            <FeaturePill icon={Waves} title="Музыкальный workflow" text="Релизы, лента, сообщения и аналитика доступны без переключения между разными интерфейсами." />
            <FeaturePill icon={LockKeyhole} title="Безопасный доступ" text="Авторизация, восстановление и настройки аккаунта остаются в той же системе состояний и фокуса." />
          </div>
        </div>

        <div className="relative flex flex-wrap items-center gap-3 text-sm text-white/46">
          <span>Desktop и mobile</span>
          <span className="h-1 w-1 rounded-full bg-white/24" />
          <span>Единые ux-элементы</span>
          <span className="h-1 w-1 rounded-full bg-white/24" />
          <span>Hero-aligned</span>
        </div>
      </section>

      <section className="ux-surface relative overflow-hidden rounded-[32px] p-5 sm:p-7 lg:p-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/[0.06] to-transparent" />

        <div className="relative">
          <div className="mb-7 flex items-center justify-between gap-3 lg:hidden">
            <Link href="/" className="inline-flex items-center gap-3 text-white">
              <span className="ux-surface-soft inline-flex h-11 w-11 items-center justify-center rounded-2xl p-2">
                <Image
                  src="/brand/logo.png"
                  alt="ICECREAMMUSIC"
                  width={64}
                  height={80}
                  priority
                  className="h-7 w-auto object-contain"
                />
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-white/58">
                Icecreammusic
              </span>
            </Link>
            <span className="ux-pill inline-flex h-9 items-center rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d7d0ff]">
              {eyebrow}
            </span>
          </div>

          {children}
          {footer ? <div className="mt-6">{footer}</div> : null}
        </div>
      </section>
    </div>
  );
}

export function AuthHeading({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c7bcff] lg:hidden">
        Доступ к кабинету
      </p>
      <h2 className="mt-3 text-[34px] font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-[40px]">
        {title}
      </h2>
      <p className="mt-3 max-w-[44ch] text-[15px] leading-6 text-white/62">
        {description}
      </p>
    </div>
  );
}

export function AuthField({
  htmlFor,
  label,
  hint,
  error,
  children
}: {
  htmlFor?: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={htmlFor} className={authLabelClassName}>
          {label}
        </label>
        {hint ? <span className="text-xs font-medium text-white/38">{hint}</span> : null}
      </div>
      {children}
      {error ? <p className="text-sm font-medium text-rose-200">{error}</p> : null}
    </div>
  );
}

export function AuthPasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
  hint
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
  error?: string | null;
  hint?: string;
}) {
  const [visible, setVisible] = React.useState(false);

  return (
    <AuthField htmlFor={id} label={label} hint={hint} error={error}>
      <div className="ux-control flex h-12 items-center rounded-[18px] px-3">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="min-w-0 flex-1 bg-transparent px-1 text-[15px] text-white outline-none placeholder:text-white/30"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="ux-control-compact inline-flex h-9 w-9 items-center justify-center rounded-full text-white/55 transition hover:text-white"
          aria-label={visible ? "Скрыть введённые символы" : "Показать введённые символы"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </AuthField>
  );
}

export function AuthStatus({
  tone,
  children
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "rounded-[20px] border px-4 py-3 text-sm font-medium",
        tone === "error"
          ? "border-rose-400/25 bg-rose-500/10 text-rose-100"
          : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
      )}
    >
      {children}
    </div>
  );
}

function FeaturePill({
  icon: Icon,
  title,
  text
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="ux-surface-soft flex items-start gap-3 rounded-[22px] p-4">
      <span className="ux-control-compact inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[#d4cbff]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-1 block text-sm leading-6 text-white/54">{text}</span>
      </span>
    </div>
  );
}
