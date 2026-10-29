"use client";

import * as React from "react";

const MAX_TILT_DEG = 10;

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/**
 * Tilts its content toward the pointer (or with the phone's tilt) and slides a glare
 * across it. On iOS the gyroscope needs a tap to grant permission, so it starts on the first touch.
 */
export function SmartLinkTiltCover({ children, className }: { children: React.ReactNode; className?: string }) {
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = React.useState({ x: 0, y: 0, glareX: 50, glareY: 30, active: false });
  const orientationStarted = React.useRef(false);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frame = frameRef.current;
    if (!frame) return;

    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const rect = frame.getBoundingClientRect();
      // Follow the pointer anywhere on the page, strongest when it is near the cover.
      const dx = Math.max(-1, Math.min(1, (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 1.5)));
      const dy = Math.max(-1, Math.min(1, (event.clientY - (rect.top + rect.height / 2)) / (rect.height * 1.5)));
      setTilt({ x: -dy * MAX_TILT_DEG, y: dx * MAX_TILT_DEG, glareX: 50 + dx * 45, glareY: 50 + dy * 45, active: true });
    };
    const onLeave = () => setTilt((current) => ({ ...current, x: 0, y: 0, active: false }));

    window.addEventListener("pointermove", onPointer);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const startOrientation = React.useCallback(async () => {
    if (orientationStarted.current || typeof DeviceOrientationEvent === "undefined") return;
    orientationStarted.current = true;
    const request = (DeviceOrientationEvent as DeviceOrientationEventWithPermission).requestPermission;
    if (request) {
      try {
        if ((await request()) !== "granted") return;
      } catch {
        return;
      }
    }
    window.addEventListener("deviceorientation", (event) => {
      if (event.beta === null || event.gamma === null) return;
      // Hold-angle around 45° is "flat" for a phone in hand.
      const dx = Math.max(-1, Math.min(1, event.gamma / 30));
      const dy = Math.max(-1, Math.min(1, (event.beta - 45) / 30));
      setTilt({ x: -dy * MAX_TILT_DEG, y: dx * MAX_TILT_DEG, glareX: 50 + dx * 45, glareY: 50 + dy * 45, active: true });
    });
  }, []);

  React.useEffect(() => {
    // Android grants the gyroscope without asking, so start right away there.
    const request = typeof DeviceOrientationEvent !== "undefined" ? (DeviceOrientationEvent as DeviceOrientationEventWithPermission).requestPermission : undefined;
    if (!request && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) void startOrientation();
  }, [startOrientation]);

  return (
    <div style={{ perspective: "900px" }} className={className} onClick={() => void startOrientation()}>
      <div
        ref={frameRef}
        className="relative h-full w-full transition-transform duration-300 ease-out will-change-transform"
        style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transformStyle: "preserve-3d" }}
      >
        {children}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{
            opacity: tilt.active ? 1 : 0.35,
            background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,0.32), rgba(255,255,255,0) 55%)`,
            mixBlendMode: "overlay"
          }}
        />
      </div>
    </div>
  );
}
