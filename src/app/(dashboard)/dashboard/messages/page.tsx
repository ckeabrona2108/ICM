import { MessageSquare } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supportThreads } from "@/lib/mock-data";

export default function MessagesPage() {
  return (
    <DashboardShell>
      <PageHeader
        title="Сообщения и поддержка"
        description="Общайтесь с модерацией, финансами и поддержкой в едином центре диалогов."
        actions={<Button>Новый тикет</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Диалоги поддержки</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {supportThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left transition hover:bg-white/5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[15px] font-semibold text-white">{thread.subject}</p>
                  {thread.unread > 0 ? <Badge variant="warning">{thread.unread} непроч.</Badge> : <Badge variant="muted">Прочитано</Badge>}
                </div>
                <p className="mt-1 text-[14px] font-medium text-white/62">{thread.lastMessage}</p>
                <p className="mt-1 text-[13px] font-medium text-cyan-300">{thread.updatedAt}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-cyan-300" />
              Превью диалога
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-[15px] font-medium text-white/68">
              Поддержка: команда модерации проверила ваш UPC и пакет метаданных.
            </div>
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3 text-[15px] font-medium text-cyan-100">
              Вы: Спасибо. Держите меня в курсе, когда проверка Spotify будет завершена.
            </div>
            <div className="flex gap-2 pt-2">
              <Input placeholder="Введите сообщение..." />
              <Button>Отправить</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
