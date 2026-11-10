/**
 * A lush fir branch coming in from a top corner with glossy baubles in the brand palette
 * (violet, ice blue, gold). Decorative only; mirror it for the right corner.
 * The shape is generated once at module load from a fixed seed, so server and client match.
 */

interface Point {
  x: number;
  y: number;
}

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = seeded(20261231);

function bezier(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
  };
}

interface Twig {
  from: Point;
  control: Point;
  to: Point;
  needle: number;
}

const STEM: Twig = { from: { x: -12, y: -4 }, control: { x: 150, y: 18 }, to: { x: 300, y: 128 }, needle: 24 };

function sideTwig(t: number, side: 1 | -1, length: number): Twig {
  const origin = bezier(STEM.from, STEM.control, STEM.to, t);
  const ahead = bezier(STEM.from, STEM.control, STEM.to, Math.min(1, t + 0.02));
  const angle = Math.atan2(ahead.y - origin.y, ahead.x - origin.x) + side * 0.72;
  const to = { x: origin.x + Math.cos(angle) * length, y: origin.y + Math.sin(angle) * length };
  const bend = side * length * 0.14;
  return {
    from: origin,
    control: { x: (origin.x + to.x) / 2 - Math.sin(angle) * bend, y: (origin.y + to.y) / 2 + Math.cos(angle) * bend },
    to,
    needle: 12 + length * 0.09
  };
}

const TWIGS: Twig[] = [
  STEM,
  sideTwig(0.16, 1, 74),
  sideTwig(0.3, -1, 58),
  sideTwig(0.42, 1, 96),
  sideTwig(0.56, -1, 70),
  sideTwig(0.68, 1, 78),
  sideTwig(0.8, -1, 46),
  sideTwig(0.9, 1, 40)
];

/** Needles as thin curved strokes fanning forward along a twig. `shift` offsets a layer for depth. */
function needlePaths(twig: Twig, lengthScale: number, spread: number, step: number): string {
  const parts: string[] = [];
  for (let t = 0.03; t < 1; t += step) {
    const p = bezier(twig.from, twig.control, twig.to, t);
    const q = bezier(twig.from, twig.control, twig.to, Math.min(1, t + 0.02));
    const heading = Math.atan2(q.y - p.y, q.x - p.x);
    const taper = 1 - t * 0.5;
    for (const side of [1, -1]) {
      const angle = heading + side * (spread + (random() - 0.5) * 0.3);
      const length = twig.needle * lengthScale * taper * (0.8 + random() * 0.4);
      const tip = { x: p.x + Math.cos(angle) * length, y: p.y + Math.sin(angle) * length };
      // Slight droop toward the twig direction makes needles read as soft, not spiky.
      const mid = {
        x: p.x + Math.cos(angle - side * 0.22) * length * 0.55,
        y: p.y + Math.sin(angle - side * 0.22) * length * 0.55
      };
      parts.push(
        `M${p.x.toFixed(1)} ${p.y.toFixed(1)}Q${mid.x.toFixed(1)} ${mid.y.toFixed(1)} ${tip.x.toFixed(1)} ${tip.y.toFixed(1)}`
      );
    }
  }
  return parts.join("");
}

const twigPath = (twig: Twig) =>
  `M${twig.from.x.toFixed(1)} ${twig.from.y.toFixed(1)}Q${twig.control.x.toFixed(1)} ${twig.control.y.toFixed(1)} ${twig.to.x.toFixed(1)} ${twig.to.y.toFixed(1)}`;

const WOOD = TWIGS.map(twigPath).join("");
const NEEDLES_BACK = TWIGS.map((twig) => needlePaths(twig, 1.12, 0.95, 0.03)).join("");
const NEEDLES_MID = TWIGS.map((twig) => needlePaths(twig, 0.95, 0.72, 0.026)).join("");
const NEEDLES_FRONT = TWIGS.map((twig) => needlePaths(twig, 0.7, 0.5, 0.034)).join("");

const BAUBLES = [
  { twig: 3, radius: 11, gradient: "ny-bauble-violet", glow: "rgba(167,139,250,0.55)" },
  { twig: 5, radius: 9, gradient: "ny-bauble-ice", glow: "rgba(140,232,255,0.5)" },
  { twig: 1, radius: 8, gradient: "ny-bauble-gold", glow: "rgba(245,200,106,0.5)" }
].map((bauble) => ({ ...bauble, at: TWIGS[bauble.twig].to }));

export function NewYearBranch({ mirrored = false, className = "" }: { mirrored?: boolean; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="-14 -8 330 190"
      className={`pointer-events-none ${className}`}
      style={{
        transform: mirrored ? "scaleX(-1)" : undefined,
        filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.45))"
      }}
    >
      <defs>
        <linearGradient id="ny-needles-back" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="300" y2="140">
          <stop offset="0" stopColor="#0b2f2a" />
          <stop offset="1" stopColor="#14514a" />
        </linearGradient>
        <linearGradient id="ny-needles-mid" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="300" y2="140">
          <stop offset="0" stopColor="#17614f" />
          <stop offset="1" stopColor="#2a9478" />
        </linearGradient>
        <linearGradient id="ny-needles-front" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="300" y2="140">
          <stop offset="0" stopColor="#4fc3a0" />
          <stop offset="1" stopColor="#b9f3ff" />
        </linearGradient>
        <radialGradient id="ny-bauble-violet" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#efe6ff" />
          <stop offset="0.35" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#3b1d8f" />
        </radialGradient>
        <radialGradient id="ny-bauble-ice" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#8ce8ff" />
          <stop offset="1" stopColor="#1b6f9c" />
        </radialGradient>
        <radialGradient id="ny-bauble-gold" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff6dc" />
          <stop offset="0.35" stopColor="#f5c86a" />
          <stop offset="1" stopColor="#9a6a17" />
        </radialGradient>
      </defs>

      <g fill="none" strokeLinecap="round">
        <path d={NEEDLES_BACK} stroke="url(#ny-needles-back)" strokeWidth="2.2" />
        <path d={WOOD} stroke="#3a2a22" strokeWidth="2.6" />
        <path d={NEEDLES_MID} stroke="url(#ny-needles-mid)" strokeWidth="1.7" />
        <path d={NEEDLES_FRONT} stroke="url(#ny-needles-front)" strokeWidth="1" opacity="0.75" />
      </g>

      {BAUBLES.map((bauble) => {
        const cy = bauble.at.y + bauble.radius + 9;
        return (
          <g key={bauble.gradient} style={{ filter: `drop-shadow(0 0 7px ${bauble.glow})` }}>
            <line x1={bauble.at.x} y1={bauble.at.y} x2={bauble.at.x} y2={cy - bauble.radius - 2} stroke="#f5c86a" strokeWidth="0.9" opacity="0.8" />
            <rect x={bauble.at.x - 2.6} y={cy - bauble.radius - 3.2} width="5.2" height="4" rx="1.2" fill="#e9c877" />
            <circle cx={bauble.at.x} cy={cy} r={bauble.radius} fill={`url(#${bauble.gradient})`} />
            <ellipse
              cx={bauble.at.x - bauble.radius * 0.35}
              cy={cy - bauble.radius * 0.4}
              rx={bauble.radius * 0.28}
              ry={bauble.radius * 0.16}
              fill="#ffffff"
              opacity="0.75"
              transform={`rotate(-30 ${bauble.at.x - bauble.radius * 0.35} ${cy - bauble.radius * 0.4})`}
            />
          </g>
        );
      })}
    </svg>
  );
}
