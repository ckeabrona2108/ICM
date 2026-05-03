"use client";

import * as React from "react";
import Image from "next/image";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform
} from "framer-motion";

const CARDS = [
  {
    id: "drop",
    pos: "left-32 top-0 sm:left-36 md:left-44 lg:left-52",
    size: "h-36 w-36 sm:h-40 sm:w-40 md:h-44 md:w-44 lg:h-48 lg:w-48",
    rotate: 4,
    z: "z-0",
    image: "/hero/drop.png",
    alt: "Архис — Drop Season",
    delay: 0.05,
    floatDelay: "0.5s",
    parallaxFactor: 2.4
  },
  {
    id: "vibes",
    pos: "left-0 top-12 sm:left-2 sm:top-14",
    size: "h-52 w-52 sm:h-60 sm:w-60 md:h-64 md:w-64 lg:h-72 lg:w-72",
    rotate: -10,
    z: "z-10",
    image: "/hero/vibes.png",
    alt: "JMSBRWN — Thirteenkilla",
    delay: 0.1,
    floatDelay: "0s",
    parallaxFactor: 1.4
  },
  {
    id: "love",
    pos: "right-0 top-2 md:right-2 md:top-4",
    size: "h-40 w-40 sm:h-48 sm:w-48 md:h-52 md:w-52 lg:h-56 lg:w-56",
    rotate: 12,
    z: "z-10",
    image: "/hero/love.png",
    alt: "Tigergid x Icetrae — Big Stepper",
    delay: 0.18,
    floatDelay: "2s",
    parallaxFactor: 1.6
  },
  {
    id: "live",
    pos: "left-2 top-60 sm:top-72 md:top-80 lg:top-[22rem]",
    size: "h-40 w-40 sm:h-44 sm:w-44 md:h-48 md:w-48 lg:h-52 lg:w-52",
    rotate: -16,
    z: "z-20",
    image: "/hero/live.png",
    alt: "Live show",
    delay: 0.22,
    floatDelay: "1s",
    parallaxFactor: 1.9
  },
  {
    id: "barceton",
    pos: "right-2 top-56 sm:right-4 sm:top-64 md:top-72 lg:top-80",
    size: "h-40 w-40 sm:h-44 sm:w-44 md:h-48 md:w-48 lg:h-52 lg:w-52",
    rotate: 18,
    z: "z-20",
    image: "/hero/barceton.png",
    alt: "Barceton — Громко о себе",
    delay: 0.28,
    floatDelay: "1.5s",
    parallaxFactor: 1.7
  },
  {
    id: "studio",
    pos: "bottom-16 left-24 sm:bottom-20 sm:left-32 md:bottom-24 md:left-40 lg:bottom-28 lg:left-44",
    size: "h-52 w-52 sm:h-60 sm:w-60 md:h-64 md:w-64 lg:h-72 lg:w-72",
    rotate: 6,
    z: "z-30",
    image: "/hero/studio.png",
    alt: "19",
    delay: 0.34,
    floatDelay: "3s",
    parallaxFactor: 1
  }
] as const;

export function HeroCollage() {
  const reduce = useReducedMotion();
  const containerRef = React.useRef<HTMLDivElement>(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 80, damping: 18, mass: 0.6 });
  const springY = useSpring(mouseY, { stiffness: 80, damping: 18, mass: 0.6 });

  const onMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reduce) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // -1..1 normalized
      mouseX.set((e.clientX - cx) / (rect.width / 2));
      mouseY.set((e.clientY - cy) / (rect.height / 2));
    },
    [mouseX, mouseY, reduce]
  );

  const onMouseLeave = React.useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  return (
    <div
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="relative h-[560px] w-full select-none sm:h-[640px] md:h-[720px] lg:h-[780px]"
    >
      {/* glow blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7b61ff]/30 blur-[100px]" />
        <div className="absolute right-10 top-1/3 h-56 w-56 rounded-full bg-[#ff3b5c]/20 blur-[100px]" />
      </div>

      {CARDS.map((card) => (
        <ParallaxCard
          key={card.id}
          card={card}
          springX={springX}
          springY={springY}
          reduce={Boolean(reduce)}
        />
      ))}
    </div>
  );
}

interface ParallaxCardProps {
  card: (typeof CARDS)[number];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  springX: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  springY: any;
  reduce: boolean;
}

function ParallaxCard({ card, springX, springY, reduce }: ParallaxCardProps) {
  const range = 22 * card.parallaxFactor;

  const tx = useTransform(springX, [-1, 1], [-range, range]);
  const ty = useTransform(springY, [-1, 1], [-range, range]);
  const rotateY = useTransform(springX, [-1, 1], [-6, 6]);
  const rotateX = useTransform(springY, [-1, 1], [4, -4]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 40 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.9, delay: card.delay, ease: [0.22, 1, 0.36, 1] }}
      style={
        reduce
          ? undefined
          : {
              x: tx,
              y: ty,
              rotateY,
              rotateX,
              rotate: card.rotate,
              transformPerspective: 800
            }
      }
      className={`absolute ${card.pos} ${card.size} ${card.z}`}
    >
      <div
        className="group relative h-full w-full overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0e0e10] shadow-[0_30px_70px_-20px_rgba(0,0,0,0.75)]"
        style={
          reduce
            ? undefined
            : { animation: `float-soft 6s ease-in-out ${card.floatDelay} infinite` }
        }
      >
        {/* image */}
        <Image
          src={card.image}
          alt={card.alt}
          fill
          sizes="(max-width: 768px) 50vw, 280px"
          className="pointer-events-none select-none object-cover"
          draggable={false}
          priority={card.id === "vibes"}
        />
        {/* sheen highlight */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_55%)] mix-blend-overlay" />
        {/* hover ring */}
        <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-0 ring-white/25 transition group-hover:ring-2" />
      </div>
    </motion.div>
  );
}
