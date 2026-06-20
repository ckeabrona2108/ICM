"use client";

import * as React from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring
} from "framer-motion";
import {
  BadgeCheck,
  DollarSign,
  Flame,
  Headset,
  LayoutGrid,
  Zap,
  type LucideIcon
} from "lucide-react";

interface Advantage {
  icon: LucideIcon;
  title: string;
  description: string;
}

const ADVANTAGES: Advantage[] = [
  {
    icon: DollarSign,
    title: "Заработайте больше",
    description: "Мы берём комиссию в 10%, что является одним из самых лучших результатов на рынке."
  },
  {
    icon: Zap,
    title: "Скорость работы",
    description: "Ваши релизы проходят быструю модерацию."
  },
  {
    icon: Flame,
    title: "Промо-поддержка",
    description: "Получайте размещения в самых крупных плейлистах и подборках от всех площадок."
  },
  {
    icon: BadgeCheck,
    title: "Верификация",
    description:
      "Профиль артиста должен быть официальным, поэтому мы прилагаем все усилия для получения галочек."
  },
  {
    icon: Headset,
    title: "Поддержка",
    description: "Вопросы клиента — один из главных приоритетов, мы всегда на связи."
  },
  {
    icon: LayoutGrid,
    title: "Личный аккаунт",
    description:
      "Мы — высокотехнологичный проект, в нашем личном кабинете вы можете загрузить свои релизы в любое время."
  }
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function AdvantageCards() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-100px" }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } }
      }}
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {ADVANTAGES.map((adv, i) => (
        <AdvantageCard key={adv.title} adv={adv} index={i} reduce={Boolean(reduce)} />
      ))}
    </motion.div>
  );
}

interface AdvantageCardProps {
  adv: Advantage;
  index: number;
  reduce: boolean;
}

function AdvantageCard({ adv, reduce }: AdvantageCardProps) {
  const Icon = adv.icon;
  const ref = React.useRef<HTMLDivElement>(null);

  // local mouse position within card (0..1)
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);

  // raw mouse pos in pixels for spotlight border
  const px = useMotionValue(-200);
  const py = useMotionValue(-200);

  // smoothed tilt
  const rotateX = useSpring(0, { stiffness: 120, damping: 18, mass: 0.4 });
  const rotateY = useSpring(0, { stiffness: 120, damping: 18, mass: 0.4 });

  const onMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reduce || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const nx = x / rect.width;
      const ny = y / rect.height;
      mx.set(nx);
      my.set(ny);
      px.set(x);
      py.set(y);
      // tilt: max 4deg
      rotateY.set((nx - 0.5) * 6);
      rotateX.set(-(ny - 0.5) * 6);
    },
    [mx, my, px, py, rotateX, rotateY, reduce]
  );

  const onMouseLeave = React.useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
    px.set(-200);
    py.set(-200);
  }, [rotateX, rotateY, px, py]);

  // CSS variables for the spotlight border (radial highlight at mouse pos)
  const spotlight = useMotionTemplate`radial-gradient(220px circle at ${px}px ${py}px, rgba(167,139,250,0.4), transparent 70%)`;
  const innerGlow = useMotionTemplate`radial-gradient(420px circle at ${px}px ${py}px, rgba(123,97,255,0.10), transparent 60%)`;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 24 },
        show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } }
      }}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1000,
        transformStyle: "preserve-3d"
      }}
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="group relative h-full"
    >
      {/* spotlight border layer (only visible on hover) */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[18px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: spotlight }}
      />

      {/* card content */}
      <div className="relative h-full overflow-hidden rounded-[18px] border border-white/[0.06] bg-[#101013] p-6 transition-colors duration-300 group-hover:border-white/[0.12] sm:p-7">
        {/* inner radial glow following cursor */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: innerGlow }}
        />

        {/* corner accent that fades in */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#7b61ff]/0 blur-3xl transition-all duration-500 group-hover:bg-[#7b61ff]/15" />

        <div className="relative flex items-center gap-3">
          {/* icon with micro-animation */}
          <motion.div
            whileHover={{ scale: 1.08, rotate: 6 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/85 transition-all duration-300 group-hover:border-[#a78bfa]/40 group-hover:bg-[#7b61ff]/[0.08] group-hover:text-white group-hover:shadow-[0_0_20px_-4px_rgba(167,139,250,0.5)]"
          >
            <Icon
              className="h-5 w-5 transition-colors duration-300"
              strokeWidth={1.6}
            />
          </motion.div>

          <h3 className="text-[15.5px] font-semibold text-white transition-colors duration-300 group-hover:text-white">
            {adv.title}
          </h3>
        </div>

        <p className="relative mt-4 text-[14px] leading-relaxed text-white/55 transition-colors duration-300 group-hover:text-white/75">
          {adv.description}
        </p>

        {/* underline accent that draws on hover */}
        <div className="pointer-events-none absolute bottom-0 left-6 right-6 h-px overflow-hidden">
          <div className="h-full w-full origin-left scale-x-0 bg-gradient-to-r from-transparent via-[#a78bfa]/60 to-transparent transition-transform duration-500 ease-out group-hover:scale-x-100" />
        </div>
      </div>
    </motion.div>
  );
}
