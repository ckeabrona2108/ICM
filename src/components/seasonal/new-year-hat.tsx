/**
 * A Santa hat that sits on top of a letter. Sized in `em`, so it follows the font size:
 * wrap the letter in a `relative inline-block` span and put the hat inside it.
 */
export function NewYearHat({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 64 50"
      className={`pointer-events-none ${className}`}
      style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))" }}
    >
      <defs>
        <linearGradient id="ny-hat-red" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6b7d" />
          <stop offset="0.55" stopColor="#e2384d" />
          <stop offset="1" stopColor="#a31d33" />
        </linearGradient>
        <linearGradient id="ny-hat-fur" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d5dcf2" />
        </linearGradient>
      </defs>
      <path d="M9 36C12 16 27 3 44 6C52 8 58 15 59 25C54 19 48 17 43 19C46 25 47 31 47 37Z" fill="url(#ny-hat-red)" />
      <path d="M22 13C30 6 40 5 47 9C40 9 33 12 27 18Z" fill="#ffffff" opacity="0.2" />
      <rect x="4" y="33" width="46" height="12" rx="6" fill="url(#ny-hat-fur)" />
      <circle cx="58.5" cy="27" r="5.5" fill="url(#ny-hat-fur)" />
    </svg>
  );
}
