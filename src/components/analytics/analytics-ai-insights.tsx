"use client";

import * as React from "react";

import { PageSection } from "@/components/layout/dashboard-shell";
import type { AnalyticsAiAnalyzeResponse, AnalyticsAiInsightResponse } from "@/lib/api/contracts";
import type { AnalyticsFilterState } from "@/components/analytics/analytics-filters";

interface AnalyticsAiInsightsProps {
  filters: AnalyticsFilterState;
}

function buildLatestUrl(filters: AnalyticsFilterState): string {
  const params = new URLSearchParams();
  params.set("period_days", String(filters.days));
  if (filters.releaseId) params.set("release_id", filters.releaseId);
  if (filters.platform) params.set("platform", filters.platform);
  return `/api/analytics/ai/latest?${params.toString()}`;
}

function priorityLabel(priority: "high" | "medium" | "low"): string {
  if (priority === "high") return "Высокий";
  if (priority === "medium") return "Средний";
  return "Низкий";
}

function priorityTone(priority: "high" | "medium" | "low"): string {
  if (priority === "high") return "border-rose-300/35 bg-rose-300/10 text-rose-100";
  if (priority === "medium") return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  return "border-sky-300/35 bg-sky-300/10 text-sky-100";
}

export function AnalyticsAiInsights({ filters }: AnalyticsAiInsightsProps) {
  const [insight, setInsight] = React.useState<AnalyticsAiInsightResponse | null>(null);
  const [loadingInitial, setLoadingInitial] = React.useState(true);
  const [runningAnalyze, setRunningAnalyze] = React.useState(false);
  const [requestError, setRequestError] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState("");

  const refreshLatest = React.useCallback(async () => {
    setRequestError(null);

    const response = await fetch(buildLatestUrl(filters), { method: "GET" });
    const payload = (await response.json().catch(() => null)) as
      | { insight?: AnalyticsAiInsightResponse | null; error?: string }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "Не удалось загрузить AI-анализ");
    }

    setInsight(payload?.insight ?? null);
  }, [filters]);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoadingInitial(true);
      try {
        await refreshLatest();
      } catch (error) {
        if (!cancelled) {
          setRequestError(error instanceof Error ? error.message : "Ошибка загрузки AI-аналитики");
        }
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [refreshLatest]);

  React.useEffect(() => {
    if (insight?.status !== "processing") return;

    let cancelled = false;
    const timer = window.setInterval(() => {
      if (cancelled) return;
      void refreshLatest().catch((error) => {
        if (!cancelled) {
          setRequestError(error instanceof Error ? error.message : "Ошибка обновления статуса AI");
        }
      });
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [insight?.status, refreshLatest]);

  const runAnalyze = React.useCallback(async () => {
    setRequestError(null);
    setRunningAnalyze(true);

    try {
      const response = await fetch("/api/analytics/ai/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          release_id: filters.releaseId || undefined,
          platform: filters.platform || undefined,
          period_days: filters.days,
          question: question.trim() || undefined
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | AnalyticsAiAnalyzeResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload && "error" in payload ? payload.error ?? "Не удалось запустить AI" : "Не удалось запустить AI");
      }

      if (!payload || !("status" in payload)) {
        throw new Error("Некорректный ответ AI сервиса");
      }

      setInsight(payload.insight);

      if (payload.status === "rate_limited") {
        setRequestError("Лимит AI-анализа исчерпан на сегодня. Попробуйте позже.");
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Ошибка запуска AI-анализа");
    } finally {
      setRunningAnalyze(false);
    }
  }, [filters.days, filters.platform, filters.releaseId, question]);

  const isProcessing = insight?.status === "processing";
  const isSuccess = insight?.status === "success" && Boolean(insight.response);
  const isFailed = insight?.status === "failed";

  return (
    <PageSection>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-semibold text-white">AI Monitoring</h3>
          <p className="mt-1 text-[13px] text-white/65">
            Анализ запускается вручную только по вашим агрегированным данным.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void runAnalyze();
          }}
          disabled={runningAnalyze || isProcessing}
          className="h-10 rounded-xl border border-white/15 bg-white/5 px-4 text-[14px] font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {runningAnalyze ? "Запуск..." : isSuccess ? "Обновить анализ" : "Проанализировать с AI"}
        </button>
      </div>

      <div className="mt-3">
        <label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/60">
          Вопрос к AI
          <textarea
            className="mt-1.5 min-h-[88px] w-full rounded-xl border border-white/[0.12] bg-black/25 px-3 py-2.5 text-[14px] font-medium text-white outline-none transition-colors placeholder:text-white/45 focus:border-[#7b3df5]/60"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Например: Почему упали прослушивания и какой релиз лучше продвигать?"
            maxLength={500}
          />
        </label>
      </div>

      {requestError ? <p className="mt-3 text-[13px] font-medium text-rose-300">{requestError}</p> : null}

      {loadingInitial ? (
        <p className="mt-4 text-[14px] text-white/70">Загружаем AI-аналитику…</p>
      ) : null}

      {!loadingInitial && !insight ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[14px] text-white/70">
          Запустите AI-анализ, чтобы получить рекомендации по росту.
        </p>
      ) : null}

      {!loadingInitial && isProcessing ? (
        <p className="mt-4 rounded-xl border border-[#7b3df5]/25 bg-[#7b3df5]/10 px-3.5 py-3 text-[14px] font-medium text-[#ddd4ff]">
          AI анализирует статистику…
        </p>
      ) : null}

      {!loadingInitial && isFailed ? (
        <p className="mt-4 rounded-xl border border-rose-300/30 bg-rose-300/10 px-3.5 py-3 text-[14px] text-rose-100">
          {insight?.error_message || "Не удалось выполнить анализ. Попробуйте позже."}
        </p>
      ) : null}

      {!loadingInitial && isSuccess && insight?.response ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
            <p className="text-[13px] uppercase tracking-[0.08em] text-white/55">Summary</p>
            <p className="mt-1 text-[14px] leading-relaxed text-white/90">{insight.response.summary}</p>
          </div>

          <div>
            <p className="text-[13px] uppercase tracking-[0.08em] text-white/55">Key findings</p>
            <div className="mt-2 space-y-2">
              {insight.response.key_findings.map((item, index) => (
                <div key={`${item.title}-${index}`} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
                  <p className="text-[14px] font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-[13px] text-white/80">{item.details}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[13px] uppercase tracking-[0.08em] text-white/55">Recommendations</p>
            <div className="mt-2 space-y-2">
              {insight.response.recommendations.map((item, index) => (
                <div key={`${item.title}-${index}`} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-white">{item.title}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityTone(item.priority)}`}>
                      Приоритет: {priorityLabel(item.priority)}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] text-white/80">{item.details}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[13px] uppercase tracking-[0.08em] text-white/55">Risks</p>
            <div className="mt-2 space-y-2">
              {insight.response.risks.length === 0 ? (
                <p className="text-[13px] text-white/65">Критичные риски не выявлены.</p>
              ) : (
                insight.response.risks.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
                    <p className="text-[14px] font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-[13px] text-white/80">{item.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <p className="text-[13px] uppercase tracking-[0.08em] text-white/55">Next steps</p>
            {insight.response.next_steps.length === 0 ? (
              <p className="mt-2 text-[13px] text-white/65">Следующие шаги не предложены.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-white/80">
                {insight.response.next_steps.map((step, index) => (
                  <li key={`${step}-${index}`}>{step}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
            <p className="text-[13px] uppercase tracking-[0.08em] text-white/55">Best performing</p>
            <div className="mt-2 grid gap-2 text-[13px] text-white/85 sm:grid-cols-2">
              <p>Релиз: {insight.response.best_performing.release ?? "—"}</p>
              <p>Трек: {insight.response.best_performing.track ?? "—"}</p>
              <p>Страна: {insight.response.best_performing.country ?? "—"}</p>
              <p>Площадка: {insight.response.best_performing.platform ?? "—"}</p>
              <p>Жанр: {insight.response.best_performing.genre ?? "—"}</p>
            </div>
          </div>
        </div>
      ) : null}
    </PageSection>
  );
}
