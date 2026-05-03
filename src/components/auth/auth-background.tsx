"use client";

import * as React from "react";

export function AuthBackground() {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Some browsers block autoplay until interaction even when muted; force a play attempt.
    const tryPlay = () => v.play().catch(() => {});
    tryPlay();
    const onVisibility = () => {
      if (document.visibilityState === "visible") tryPlay();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[#05050a]">
      {/* video */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/video/auth-bg-poster.jpg"
        className="auth-bg-video absolute inset-0 h-full w-full object-cover"
      >
        <source src="/video/auth-bg.webm" type="video/webm" />
        <source src="/video/auth-bg.mp4" type="video/mp4" />
      </video>

      {/* tonal overlays — keep video subtle, not loud */}
      <div className="absolute inset-0 bg-[#05050a]/65" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#05050a]/75 via-[#05050a]/45 to-[#05050a]/90" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(5,5,10,0.7)_70%,rgba(5,5,10,0.96)_100%)]" />

      {/* fine grain — subtle film texture */}
      <div className="absolute inset-0 opacity-[0.035] mix-blend-overlay [background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/></svg>')]" />
    </div>
  );
}
