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

/** One glass bulb with its socket; the glow colour cycles through the brand palette. */
function Bulb({ index }: { index: number }) {
  const [color, deep] = BULBS[index % BULBS.length];
  return (
    <span className="flex flex-col items-center">
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
}

/** Curtain mode: the cable hangs in deep rounded swags; bulbs sit along each swag. */
const SWAG_DEPTH = 34;
const BULBS_PER_SWAG = [0.18, 0.5, 0.82];

function swagY(x: number, step: number): number {
  return 3 + SWAG_DEPTH * Math.sin(Math.PI * ((x % step) / step));
}

function swagStrand(swags: number, phase: number): string {
  const step = 100 / swags;
  const points: string[] = [];
  for (let x = 0; x <= 100.001; x += step / 30) {
    const twist = Math.sin((x / step) * 4 * Math.PI * 2 + phase) * 1.1;
    points.push(`${points.length ? "L" : "M"}${x.toFixed(2)} ${(swagY(x, step) + twist).toFixed(2)}`);
  }
  return points.join("");
}

/**
 * A string of glass bulbs on a visible twisted green cable that sags between bulbs. Each bulb
 * has a socket, a glossy highlight and a soft glow, and sways slightly. With `curtain`, the cable
 * hangs in deep rounded swags with bulbs along each swag at different heights. The pulse and sway are off for
 * reduced-motion visitors (see .ny-bulb and .ny-strand in globals.css).
 */
export function NewYearGarland({
  bulbs = 18,
  curtain = false,
  className = ""
}: {
  bulbs?: number;
  curtain?: boolean;
  className?: string;
}) {
  if (curtain) {
    const swags = Math.max(2, Math.round(bulbs / BULBS_PER_SWAG.length));
    const step = 100 / swags;
    const height = SWAG_DEPTH + 8;
    return (
      <div aria-hidden className={`pointer-events-none relative w-full ${className}`} style={{ height: height + 24 }}>
        <svg className="absolute inset-x-0 top-0 w-full" style={{ height }} preserveAspectRatio="none" viewBox={`0 0 100 ${height}`}>
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={swagStrand(swags, 0)} stroke="#0f3d33" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
            <path d={swagStrand(swags, Math.PI)} stroke="#1c6a56" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <path d={swagStrand(swags, 0)} stroke="#3fae8c" strokeWidth="0.7" opacity="0.55" vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
        {Array.from({ length: swags }, (_, swag) =>
          BULBS_PER_SWAG.map((at, j) => {
            const x = (swag + at) * step;
            const index = swag * BULBS_PER_SWAG.length + j;
            return (
              <span
                key={index}
                className="absolute -translate-x-1/2"
                style={{ left: `${x}%`, top: swagY(x, step) - 1 }}
              >
                <span
                  className="ny-strand block"
                  style={{ animationDelay: `${(index % 5) * -0.9}s`, animationDuration: `${4.2 + (index % 3) * 0.7}s` }}
                >
                  <Bulb index={index} />
                </span>
              </span>
            );
          })
        )}
      </div>
    );
  }
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
        {Array.from({ length: bulbs }, (_, index) => (
          <span key={index} className="flex flex-1 flex-col items-center" style={{ paddingTop: 10 }}>
            <span className="ny-strand block" style={{ animationDelay: `${(index % 5) * -0.9}s` }}>
              <Bulb index={index} />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
