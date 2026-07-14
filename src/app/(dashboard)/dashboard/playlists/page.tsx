"use client";

import { useEffect, useState } from "react";
import { Music2, ExternalLink } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Placement {
  id: string;
  platform: string;
  upc: string;
  artistName: string;
  trackTitle: string;
  position: string | null;
  playlistName: string;
  playlistUrl: string;
  createdAt: string;
}

export default function UserPlaylistsPage() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/playlists")
      .then((res) => res.json())
      .then((data) => {
        if (data.placements) {
          setPlacements(data.placements);
        }
      })
      .catch((err) => console.error("Failed to fetch playlists:", err))
      .finally(() => setIsLoading(false));
  }, []);

  const getPlatformIcon = (platform: string) => {
    // В идеале использовать реальные логотипы
    // Здесь мы просто ставим Music2 как заглушку, но можно возвращать логотипы (VK, Yandex и т.д.)
    return <Music2 className="h-5 w-5 text-muted-foreground" />;
  };

  const getPlatformName = (platform: string) => {
    switch (platform) {
      case "VK": return "VK Музыка";
      case "YANDEX": return "Яндекс Музыка";
      case "APPLE": return "Apple Music";
      case "SPOTIFY": return "Spotify";
      default: return platform;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Мои Плейлисты</h1>
        <p className="text-muted-foreground mt-2">
          Здесь отображаются треки, которые попали в редакторские плейлисты на стриминговых площадках.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground animate-pulse">
          Загрузка плейлистов...
        </div>
      ) : placements.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center border-dashed">
          <Music2 className="h-10 w-10 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Пока нет плейлистов</h3>
          <p className="text-muted-foreground max-w-sm mt-2">
            Как только ваши треки попадут в редакторские плейлисты площадок, они появятся здесь.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {placements.map((placement) => (
            <Card key={placement.id} className="overflow-hidden hover:shadow-md transition-all">
              <CardHeader className="bg-muted/30 pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getPlatformIcon(placement.platform)}
                    <span className="font-semibold text-sm">
                      {getPlatformName(placement.platform)}
                    </span>
                  </div>
                  {placement.position && (
                    <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded-full">
                      Позиция: {placement.position}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <CardTitle className="line-clamp-1 mb-1">{placement.playlistName}</CardTitle>
                <CardDescription className="line-clamp-1 mb-4">
                  {placement.artistName} — {placement.trackTitle}
                </CardDescription>

                <a
                  href={placement.playlistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "outline" }), "w-full")}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Перейти к плейлисту
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
