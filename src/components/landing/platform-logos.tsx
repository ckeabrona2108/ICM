import * as React from "react";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

const base = (size = 28): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  xmlns: "http://www.w3.org/2000/svg"
});

function Tile({
  size = 28,
  bg,
  children,
  ...props
}: LogoProps & {
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <svg {...base(size)} {...props}>
      <rect width="24" height="24" rx="6" fill={bg} />
      {children}
    </svg>
  );
}

export function SpotifyLogo({ size = 28, ...props }: LogoProps) {
  return (
    <svg {...base(size)} {...props} fill="#1DB954">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.32a.74.74 0 0 1-1.03.25c-2.83-1.73-6.39-2.12-10.59-1.16a.75.75 0 1 1-.34-1.46c4.6-1.05 8.55-.6 11.71 1.34.36.22.47.7.25 1.03zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.24-1.99-8.18-2.57-12.01-1.4a.94.94 0 1 1-.55-1.8c4.4-1.34 9.85-.7 13.55 1.6.44.27.58.85.3 1.29zm.13-3.4c-3.88-2.31-10.3-2.52-14.01-1.4a1.13 1.13 0 1 1-.66-2.16c4.27-1.29 11.36-1.04 15.83 1.6a1.13 1.13 0 1 1-1.16 1.96z" />
    </svg>
  );
}

export function SoundCloudLogo({ size = 28, ...props }: LogoProps) {
  return (
    <svg {...base(size)} {...props}>
      <rect width="24" height="24" rx="6" fill="#FF6A00" />
      <path
        d="M8.2 9.9a2.8 2.8 0 0 1 2.6-1.7c1.2 0 2.2.7 2.7 1.7h.3a2.2 2.2 0 1 1 0 4.4H8.2a.6.6 0 0 1-.6-.6v-3.2c0-.33.27-.6.6-.6zm-1.1 1.1c.2 0 .4.17.4.38v2.46a.4.4 0 0 1-.8 0v-2.46c0-.21.18-.38.4-.38zm-1.2.5c.2 0 .4.16.4.36v1.5a.4.4 0 0 1-.8 0v-1.5c0-.2.18-.36.4-.36zm-1 .7c.19 0 .35.16.35.35v.8a.35.35 0 0 1-.7 0v-.8c0-.2.16-.35.35-.35z"
        fill="#fff"
      />
    </svg>
  );
}

export function AppleMusicLogo({ size = 28, ...props }: LogoProps) {
  return (
    <svg {...base(size)} {...props}>
      <defs>
        <linearGradient id="amg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FA5C7C" />
          <stop offset="1" stopColor="#FA243C" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#amg)" />
      <path
        d="M16.6 6.7c0-.4-.3-.7-.8-.6l-5.7 1.2c-.4.1-.7.4-.7.8v6.3a2 2 0 1 0 1.4 1.9V9.7l4.4-.93v3.83a2 2 0 1 0 1.4 1.9V6.7z"
        fill="#fff"
      />
    </svg>
  );
}

export function VkMusicLogo({ size = 28, ...props }: LogoProps) {
  return (
    <svg {...base(size)} {...props}>
      <defs>
        <linearGradient id="vkg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A059F7" />
          <stop offset="1" stopColor="#5D3DD1" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#vkg)" />
      <path
        d="M7 9.5c0-.4.3-.7.7-.7l8.6-1.5c.5-.1.9.3.9.7v7.5a2 2 0 1 1-1.4-1.9V10l-7.4 1.3v3.7a2 2 0 1 1-1.4-1.9V9.5z"
        fill="#fff"
      />
    </svg>
  );
}

export function YandexMusicLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#00D6C9" {...props}>
      <path
        d="M12 4.1 13.55 8l4.25-1.4-1.36 4.26L20.5 12l-4.06 1.15 1.36 4.25-4.25-1.36L12 19.9l-1.54-3.86-4.26 1.36 1.37-4.25L3.5 12l4.07-1.14L6.2 6.6 10.46 8 12 4.1Z"
        fill="#fff"
      />
      <circle cx="12" cy="12" r="2.15" fill="#00B7AB" />
    </Tile>
  );
}

export function YouTubeMusicLogo({ size = 28, ...props }: LogoProps) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="11" fill="#FF0033" />
      <path d="M9.6 8.5v7l6-3.5-6-3.5z" fill="#fff" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="0.8" />
    </svg>
  );
}

export function TikTokLogo({ size = 28, ...props }: LogoProps) {
  return (
    <svg {...base(size)} {...props}>
      <rect width="24" height="24" rx="6" fill="#0a0a0a" />
      <path
        d="M16.6 8.4c-1 0-1.9-.4-2.6-1V14a3.5 3.5 0 1 1-3.5-3.5h.4v1.9a1.6 1.6 0 1 0 1.2 1.6V5.5h1.9a3.6 3.6 0 0 0 2.6 2.5v.4z"
        fill="#FF0050"
      />
      <path
        d="M16 7.9c-1 0-1.9-.4-2.6-1V13.5a3.5 3.5 0 1 1-3.5-3.5h.4v1.9a1.6 1.6 0 1 0 1.2 1.6V5h1.9a3.6 3.6 0 0 0 2.6 2.5v.4z"
        fill="#25F4EE"
      />
      <path
        d="M16.3 8.15c-1 0-1.9-.4-2.6-1V13.75a3.5 3.5 0 1 1-3.5-3.5h.4v1.9a1.6 1.6 0 1 0 1.2 1.6V5.25h1.9a3.6 3.6 0 0 0 2.6 2.5v.4z"
        fill="#fff"
      />
    </svg>
  );
}

export function TidalLogo({ size = 28, ...props }: LogoProps) {
  return (
    <svg {...base(size)} {...props}>
      <rect width="24" height="24" rx="6" fill="#101010" />
      <path
        d="M7.35 7.1 9.9 9.65 12.45 7.1 15 9.65 17.55 7.1 20.1 9.65 17.55 12.2 15 9.65 12.45 12.2 9.9 9.65 7.35 12.2 4.8 9.65 7.35 7.1Zm2.55 5.1 2.55 2.55L15 12.2l2.55 2.55-2.55 2.55L12.45 14.75 9.9 17.3l-2.55-2.55L9.9 12.2Z"
        fill="#fff"
      />
    </svg>
  );
}

export function MtsMusicLogo({ size = 28, ...props }: LogoProps) {
  return (
    <svg {...base(size)} {...props}>
      <defs>
        <linearGradient id="mtsg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF2442" />
          <stop offset="1" stopColor="#D70022" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#mtsg)" />
      <path
        d="M7.1 15.7V8.3h1.5l2 2.8 2-2.8h1.5v7.4h-1.6v-4.5l-1.7 2.4h-.4l-1.7-2.4v4.5H7.1Zm8.3-6.1a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm-.8 6.1v-5h1.6v5h-1.6Z"
        fill="#fff"
      />
    </svg>
  );
}

export function ZvukLogo({ size = 28, ...props }: LogoProps) {
  return (
    <svg {...base(size)} {...props}>
      <defs>
        <linearGradient id="zvg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#69F5DE" />
          <stop offset="1" stopColor="#26C7AF" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#zvg)" />
      <path
        d="M6.9 8.1h10.2v1.3l-5.3 5.2h5.3v1.3H6.9v-1.3l5.3-5.2H6.9V8.1Z"
        fill="#062A27"
      />
    </svg>
  );
}

export function DeezerLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#111318" {...props}>
      <rect x="5.2" y="13.2" width="2.1" height="4.2" rx="0.7" fill="#8B5CF6" />
      <rect x="8.2" y="10.8" width="2.1" height="6.6" rx="0.7" fill="#4F46E5" />
      <rect x="11.2" y="8.8" width="2.1" height="8.6" rx="0.7" fill="#06B6D4" />
      <rect x="14.2" y="10.1" width="2.1" height="7.3" rx="0.7" fill="#10B981" />
      <rect x="17.2" y="12.4" width="2.1" height="5" rx="0.7" fill="#F59E0B" />
    </Tile>
  );
}

export function AmazonMusicLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#1C274C" {...props}>
      <path
        d="M8.1 14.6V8.8h1.5v3.75a2.1 2.1 0 1 1-1.5 2.05Zm6.4-4.7L11.6 10V8.6l3.9-.55v4.52a2.1 2.1 0 1 1-1.5 2.05V9.9Z"
        fill="#fff"
      />
      <path
        d="M7.3 17.9c2.9 1.25 6.4 1.27 9.33.06.58-.24 1.04.48.46.84-3.32 2.05-7.54 2.04-10.86-.03-.55-.34-.12-1.03.4-.87Z"
        fill="#37D0FF"
      />
    </Tile>
  );
}

export function OdnoklassnikiLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#F58220" {...props}>
      <circle cx="12" cy="8.2" r="2.2" fill="#fff" />
      <path
        d="M8.8 12.6c1.05.78 2.14 1.16 3.2 1.16 1.06 0 2.15-.38 3.2-1.16a.88.88 0 1 1 1.04 1.42c-.8.58-1.61 1-2.42 1.25l1.9 1.92a.95.95 0 0 1-1.35 1.34L12 16.15l-2.45 2.44a.95.95 0 1 1-1.34-1.34l1.9-1.92a8.19 8.19 0 0 1-2.43-1.25.88.88 0 1 1 1.05-1.42Z"
        fill="#fff"
      />
    </Tile>
  );
}

export function AnghamiLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#111827" {...props}>
      <path
        d="M12 6.1c2.65 0 4.8 2.15 4.8 4.8v3.83a3.2 3.2 0 1 1-1.5-2.73V10.9A3.3 3.3 0 0 0 12 7.6a3.3 3.3 0 0 0-3.3 3.3v.77a2.85 2.85 0 1 1-1.5 0v-.77c0-2.65 2.15-4.8 4.8-4.8Z"
        fill="#FF3B30"
      />
    </Tile>
  );
}

export function QobuzLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#0F172A" {...props}>
      <circle cx="10.8" cy="10.8" r="3.9" fill="none" stroke="#fff" strokeWidth="1.8" />
      <path d="M13.55 13.55 17.6 17.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="15.9" y="15.7" width="2.8" height="2.8" rx="0.65" fill="#fff" />
    </Tile>
  );
}

export function PandoraLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#2752FF" {...props}>
      <path
        d="M8 5.7h4.95a4.25 4.25 0 1 1 0 8.5H10.1V18.3H8V5.7Zm2.1 2.02v4.43h2.53a2.22 2.22 0 1 0 0-4.43H10.1Z"
        fill="#fff"
      />
    </Tile>
  );
}

export function KKBoxLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#19C964" {...props}>
      <circle cx="12" cy="12" r="6.7" fill="none" stroke="#fff" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3.9" fill="none" stroke="#fff" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="1.2" fill="#fff" />
    </Tile>
  );
}

export function JioSaavnLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#16A34A" {...props}>
      <path
        d="M14.9 6.7v7.35a2.45 2.45 0 1 1-1.6-2.3V8.1L10 8.7V7.2l4.9-.5Z"
        fill="#F4FDE7"
      />
      <path d="M7.2 16.4c1.25 1.25 3.38 1.55 5.15.72" stroke="#F4FDE7" strokeWidth="1.2" strokeLinecap="round" />
    </Tile>
  );
}

export function NeteaseLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#EF4444" {...props}>
      <path
        d="M14.2 7.1a4.1 4.1 0 0 1 0 8.2h-1.75a2.3 2.3 0 1 1 0-1.5h1.75a2.6 2.6 0 0 0 0-5.2h-.85a3.65 3.65 0 1 0 0 7.3h1.15v1.45h-1.15a5.1 5.1 0 1 1 0-10.2h.85Z"
        fill="#fff"
      />
    </Tile>
  );
}

export function LineMusicLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#06C755" {...props}>
      <rect x="5.8" y="7" width="12.4" height="10" rx="2.6" fill="#fff" />
      <path d="M9.4 10v4.2h4.6" stroke="#06C755" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.4" cy="10" r="0.9" fill="#06C755" />
    </Tile>
  );
}

export function IHeartLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#E11D48" {...props}>
      <path
        d="M12 18.1 6.9 13c-1.55-1.55-1.55-4.06 0-5.61a3.95 3.95 0 0 1 5.1-.45 3.95 3.95 0 0 1 5.1.45c1.55 1.55 1.55 4.06 0 5.61L12 18.1Z"
        fill="#fff"
      />
      <path d="M9.2 12.2h1.45l1-2.1 1.1 4 1.05-1.9h.95" stroke="#E11D48" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
    </Tile>
  );
}

export function AwaLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#121212" {...props}>
      <path d="M8 16.5 12 7.4l4 9.1-1.65.73-2.35-5.33-2.35 5.33L8 16.5Z" fill="#fff" />
      <path d="M7 17.2h10" stroke="#F97316" strokeWidth="1.2" strokeLinecap="round" />
    </Tile>
  );
}

export function TrebelLogo({ size = 28, ...props }: LogoProps) {
  return (
    <Tile size={size} bg="#7C3AED" {...props}>
      <path d="M7.1 7.2h9.8v2H13.1V17h-2.2V9.2H7.1v-2Z" fill="#fff" />
    </Tile>
  );
}

export function ShazamLogo({ size = 28, ...props }: LogoProps) {
  return (
    <svg {...base(size)} {...props}>
      <defs>
        <linearGradient id="shg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1F8AFF" />
          <stop offset="1" stopColor="#0066D6" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#shg)" />
      <path
        d="M14.5 8.5c-1.2-.7-2.7-.5-3.6.4l-.6.6.7.7.6-.6c.5-.5 1.4-.6 2-.2.7.4.9 1.3.5 2l-.6 1c-.4.7-1.3.9-2 .5-.6-.4-.8-1.2-.6-1.8l-1-.6c-.5 1.2-.1 2.5 1 3.2 1.2.7 2.7.4 3.4-.7l.6-1c.7-1.2.4-2.7-.8-3.5z"
        fill="#fff"
      />
    </svg>
  );
}
