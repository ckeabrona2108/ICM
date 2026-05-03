"use client";

import { useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { aiTools } from "@/lib/mock-data";

export default function AiStudioPage() {
  const [selectedTool, setSelectedTool] = useState(aiTools[0]);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");

  return (
    <DashboardShell>
      <PageHeader
        title="AI Студии"
        description="Генерируйте тексты артиста, релизные описания и идеи кампаний с production-ready промптами."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="grid gap-3">
          {aiTools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                setSelectedTool(tool);
                setPrompt("");
                setResult("");
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                selectedTool.id === tool.id
                  ? "border-cyan-400/40 bg-cyan-500/10"
                  : "border-white/10 bg-black/20 hover:bg-white/5"
              }`}
            >
              <p className="text-[16px] font-semibold text-white">{tool.title}</p>
              <p className="mt-1 text-[14px] font-medium text-white/65">{tool.description}</p>
              <p className="mt-2 text-[13px] font-medium text-cyan-300">Осталось: {tool.usageLeft}</p>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{selectedTool.title}</CardTitle>
            <CardDescription>{selectedTool.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder={selectedTool.promptPlaceholder}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-32"
            />
            <div className="flex justify-end">
              <Button
                onClick={() =>
                  setResult(
                    `Generated output for ${selectedTool.title}: launch-ready draft with tone alignment, platform adaptation and CTA options.`
                  )
                }
                disabled={!prompt.trim()}
              >
                Сгенерировать
              </Button>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">Результат</p>
              <p className="text-[15px] font-medium text-white">{result || "Результат генерации появится здесь."}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
