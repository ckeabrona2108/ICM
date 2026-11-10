/** Brand palette bulbs: violet, ice blue, gold, pink. Each: [glass colour, deep shade]. */
const BULBS: Array<[string, string]> = [
  ["#f5c86a", "#b97f1c"],
  ["#8ce8ff", "#2587b5"],
  ["#a78bfa", "#5b33d6"],
  ["#f2a7d0", "#c2528f"]
];

const WIRE_HEIGHT = 12;

/** Height of the sagging wire at x (0–100): lowest in the middle of each bulb's span. */
function sag(x: number, step: number): number {
  const local = (x % step) / step;
  return 1.5 + 5.5 * Math.sin(Math.PI * local);
}

/** One strand of the twisted cable; two strands in opposite phase read as a wound cord. */
function strand(bulbs: number, phase: number): string {
  const step = 100 / bulbs;
  const points: string[] = [];
  const twistsPerSpan = 3;
  for (let x = 0; x <= 100.001; x += step / 24) {
    const twist = Math.sin((x / step) * twistsPerSpan * Math.PI * 2 + phase) * 1.1;
    points.push(`${points.length ? "L" : "M"}${x.toFixed(2)} ${(sag(x, step) + twist).toFixed(2)}`);
  }
  return points.join("");
}

/**
 * A string of glass bulbs on a visible twisted green cable that sags between bulbs. Each bulb
 * has a socket, a glossy highlight and a soft glow. The gentle pulse is off for reduced-motion
 * visitors (see .ny-bulb in globals.css).
 */
export function NewYearGarland({ bulbs = 18, className = "" }: { bulbs?: number; className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none relative h-9 w-full ${className}`}>
      <svg
        className="absolute inset-x-0 top-0 w-full"
        style={{ height: WIRE_HEIGHT * 1.6 }}
        preserveAspectRatio="none"
        viewBox={`0 0 100 ${WIRE_HEIGHT}`}
      >
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={strand(bulbs, 0)} stroke="#0f3d33" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
          <path d={strand(bulbs, Math.PI)} stroke="#1c6a56" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <path d={strand(bulbs, 0)} stroke="#3fae8c" strokeWidth="0.7" opacity="0.55" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      <div className="absolute inset-x-0 top-0 flex">
        {Array.from({ length: bulbs }, (_, index) => {
          const [color, deep] = BULBS[index % BULBS.length];
          return (
            <span key={index} className="flex flex-1 flex-col items-center" style={{ paddingTop: 10 }}>
              <span className="block h-[5px] w-[6px] rounded-[1.5px] bg-[#14342d] ring-1 ring-[#3fae8c]/40" />
              <span
                className="ny-bulb -mt-px block h-[13px] w-[9px] rounded-[45%_45%_50%_50%/38%_38%_62%_62%]"
                style={{
                  background: `radial-gradient(circle at 36% 30%, #ffffff 0%, ${color} 38%, ${deep} 100%)`,
                  boxShadow: `0 0 12px 3px ${color}66, 0 0 26px 8px ${color}26`,
                  animationDelay: `${(index % 4) * 0.45}s`
                }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
