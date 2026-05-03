import { Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const recommendations = [
  "Switch pre-save call to action to short-form videos for +18% conversion.",
  "Submit release pitch at least 7 days before release date for editorial placements.",
  "Add bilingual metadata (EN + RU) to improve local search ranking in CIS regions."
];

export function AiRecommendations() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-violet-300" />
          AI Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {recommendations.map((item) => (
          <div key={item} className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
            {item}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
