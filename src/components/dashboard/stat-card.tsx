import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  trend?: string;
  icon: LucideIcon;
  tone?: "blue" | "cyan" | "violet";
}

export function StatCard({ title, value, trend, icon: Icon, tone = "blue" }: StatCardProps) {
  const toneClass = {
    blue: "from-blue-500/25 to-blue-400/10",
    cyan: "from-cyan-500/25 to-cyan-400/10",
    violet: "from-violet-500/25 to-violet-400/10"
  }[tone];

  return (
    <Card className="p-0">
      <CardContent className={cn("relative overflow-hidden rounded-2xl border border-white/10 p-5", "bg-gradient-to-br", toneClass)}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-black/25 p-2">
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>

        {trend ? (
          <div className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
            <ArrowUpRight className="h-3.5 w-3.5" />
            {trend}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
