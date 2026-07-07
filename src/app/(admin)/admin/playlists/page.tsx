"use client";

import { useState } from "react";
import { Upload, FileUp, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminPlaylistsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; successCount?: number; errorCount?: number; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !platform) return;

    setIsLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("platform", platform);

    try {
      const res = await fetch("/api/admin/playlists/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error || "Ошибка при загрузке" });
      } else {
        setResult(data);
        setFile(null); // сброс после успеха
      }
    } catch (err) {
      setResult({ error: "Сетевая ошибка" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Загрузка плейлистов</h1>
        <p className="text-muted-foreground mt-2">
          Загрузите Excel-файл (XLSX) с отчетом о попадании релизов в редакторские плейлисты.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Новая загрузка</CardTitle>
          <CardDescription>
            Файл должен содержать колонки: UPC (или ISRC), Артист, Наименование (или Трек), Позиция, Плейлист, Ссылка (или Ссылка на плейлист).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label>Площадка</Label>
              <Select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                required
                options={[
                  { label: "Выберите площадку...", value: "" },
                  { label: "VK Музыка", value: "VK" },
                  { label: "Яндекс Музыка", value: "YANDEX" },
                  { label: "Apple Music", value: "APPLE" },
                  { label: "Spotify", value: "SPOTIFY" }
                ]}
              />
            </div>

            <div className="space-y-2">
              <Label>Файл XLSX</Label>
              <Input
                type="file"
                accept=".xlsx, .xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />
            </div>

            <Button type="submit" disabled={!file || !platform || isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Upload className="mr-2 h-4 w-4 animate-bounce" />
                  Загрузка...
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-4 w-4" />
                  Загрузить данные
                </>
              )}
            </Button>
          </form>

          {result?.ok && (
            <div className="mt-6 rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-green-600 flex gap-3">
              <CheckCircle className="h-5 w-5 shrink-0" />
              <div>
                <h5 className="font-medium leading-none tracking-tight mb-1">Успешно загружено</h5>
                <div className="text-sm [&_p]:leading-relaxed">
                  Добавлено или обновлено записей: {result.successCount}.
                  Ошибок / пропущено: {result.errorCount}.
                </div>
              </div>
            </div>
          )}

          {result?.error && (
            <div className="mt-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-600 flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div>
                <h5 className="font-medium leading-none tracking-tight mb-1">Ошибка</h5>
                <div className="text-sm [&_p]:leading-relaxed">{result.error}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
