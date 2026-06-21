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
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="11" fill="#FFCC00" />
      <path
        d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-1.6 11.5V8.5l5 3.5-5 3.5z"
        fill="#000"
      />
    </svg>
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
