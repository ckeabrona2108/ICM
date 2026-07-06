"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru">
      <body className="m-0 bg-[#0b0d12] text-white">
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/30 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">ICECREAMMUSIC</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Критическая ошибка приложения</h1>
            <p className="mt-3 text-sm text-white/65">Приложение не смогло отрисоваться. Попробуйте перезагрузить страницу или открыть её снова.</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={reset}
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
              >
                Повторить
              </button>
              <a
                href="/"
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/8"
              >
                На главную
              </a>
            </div>
            {process.env.NODE_ENV === "development" ? (
              <pre className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/70">
                {error.message}
              </pre>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
