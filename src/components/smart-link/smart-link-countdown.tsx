"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

const CONFETTI_MS = 2600;
const CONFETTI_COLORS = ["#7b61ff", "#ff6fb5", "#22d3ee", "#7df0c4", "#ffd166", "#ffffff"];

function splitRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60
  };
}

/** A short burst of confetti over the page, then it removes itself. */
function ConfettiBurst() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const pieces = Array.from({ length: 160 }, (_, index) => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.2,
      y: canvas.height * 0.35,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 15 - 5,
      size: 5 + Math.random() * 6,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length]
    }));
    const startedAt = performance.now();
    let frameId = 0;
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.globalAlpha = Math.max(0, 1 - elapsed / CONFETTI_MS);
      for (const piece of pieces) {
        piece.vy += 0.35;
        piece.vx *= 0.99;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.rotation += piece.spin;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.rotation);
        context.fillStyle = piece.color;
        context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
        context.restore();
      }
      if (elapsed < CONFETTI_MS) frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 h-full w-full" />;
}

/**
 * Ticks down to the release moment with flipping digits. When the release goes live it
 * fires a confetti burst, then reloads the page so it switches to the platform buttons.
 */
export function SmartLinkCountdown({ target, theme }: { target: string; theme: "dark" | "light" }) {
  const router = useRouter();
  const targetTime = React.useMemo(() => Date.parse(target), [target]);
  const [now, setNow] = React.useState<number | null>(null);
  const [celebrating, setCelebrating] = React.useState(false);

  React.useEffect(() => {
    setNow(Date.now());
    let refreshTimer = 0;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= targetTime) {
        window.clearInterval(timer);
        setCelebrating(true);
        refreshTimer = window.setTimeout(() => router.refresh(), CONFETTI_MS);
      }
    }, 1000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(refreshTimer);
    };
  }, [router, targetTime]);

  // Rendered empty on the server so the first client paint never disagrees with it.
  const parts = splitRemaining(now === null ? 0 : targetTime - now);
  const cells = [
    { value: parts.days, label: "дн" },
    { value: parts.hours, label: "ч" },
    { value: parts.minutes, label: "мин" },
    { value: parts.seconds, label: "сек" }
  ];
  const isLight = theme === "light";

  return (
    <>
      {celebrating ? <ConfettiBurst /> : null}
      <div className="grid grid-cols-4 gap-2" aria-live="off">
        {cells.map((cell) => {
          const text = now === null ? "—" : String(cell.value).padStart(2, "0");
          return (
            <div
              key={cell.label}
              className={`relative overflow-hidden rounded-[14px] border px-2 py-2.5 text-center ${
                isLight ? "border-black/8 bg-white/80" : "border-white/10 bg-white/[0.06]"
              }`}
            >
              {/* The hinge line of a flip clock. */}
              <span aria-hidden="true" className={`absolute inset-x-0 top-[42%] h-px ${isLight ? "bg-black/10" : "bg-black/40"}`} />
              <div className={`text-[24px] font-semibold tabular-nums tracking-[-0.03em] ${isLight ? "text-[#121620]" : "text-white"}`}>
                {/* Re-keyed on every change so each new value flips in. */}
                <span key={text} className="sl-digit-flip">
                  {text}
                </span>
              </div>
              <div className={`text-[11px] ${isLight ? "text-black/50" : "text-white/55"}`}>{cell.label}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
