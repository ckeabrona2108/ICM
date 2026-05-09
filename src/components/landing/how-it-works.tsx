"use client";

import * as React from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion
} from "framer-motion";
import {
  LineChart,
  Rocket,
  ShieldCheck,
  Type,
  Upload,
  UserPlus,
  type LucideIcon
} from "lucide-react";

interface Step {
  icon: LucideIcon;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    icon: UserPlus,
    title: "Зарегистрируйтесь",
    description:
      "Заполните необходимую информацию в форме регистрации, включая ваше имя, электронную почту и пароль."
  },
  {
    icon: Upload,
    title: "Загрузите вашу музыку",
    description:
      "Загрузите свои аудиофайлы согласно простым указаниям, созданным для вашего удобства."
  },
  {
    icon: Type,
    title: "Добавьте метаданные релиза",
    description:
      "Введите важные метаданные: название трека, исполнитель, жанр и другие детали."
  },
  {
    icon: ShieldCheck,
    title: "Модерация",
    description:
      "После загрузки вашего релиза, трек будет проверяться нашими модераторами в течение 2-3 дней."
  },
  {
    icon: Rocket,
    title: "Запустите вашу музыку в мир!",
    description: "Ваши треки будут доступны миллионам слушателей в выбранных сервисах."
  },
  {
    icon: LineChart,
    title: "Статистика",
    description:
      "Следите за успехом вашей музыки с помощью статистики и отчётов в режиме реального времени."
  }
];

// Premium ease-out-expo (Apple-like)
const EASE = [0.16, 1, 0.3, 1] as const;

export function HowItWorks() {
  const reduce = useReducedMotion();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: false, margin: "-30%" });

  const [activeIndex, setActiveIndex] = React.useState(0);
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const [isPaused, setIsPaused] = React.useState(false);

  React.useEffect(() => {
    if (!isInView || isPaused || reduce) return;
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % STEPS.length);
    }, 3000);
    return () => clearInterval(id);
  }, [isInView, isPaused, reduce]);

  const highlightIndex = hoveredIndex ?? activeIndex;

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative overflow-visible rounded-[28px] border border-white/[0.06] bg-[#0c0c0f] p-6 sm:p-10 lg:p-14"
    >
      {/* moving spotlight */}
      <Spotlight index={highlightIndex} reduce={Boolean(reduce)} />

      {/* dotted connectors with traveling light */}
      <Connectors activeIndex={highlightIndex} reduce={Boolean(reduce)} />

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } }
        }}
        className="relative grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3"
      >
        {STEPS.map((step, i) => (
          <StepCard
            key={step.title}
            step={step}
            index={i}
            active={highlightIndex === i}
            onHover={() => setHoveredIndex(i)}
            onLeave={() => setHoveredIndex(null)}
          />
        ))}
      </motion.div>
    </div>
  );
}

interface StepCardProps {
  step: Step;
  index: number;
  active: boolean;
  onHover: () => void;
  onLeave: () => void;
}

function StepCard({ step, index, active, onHover, onLeave }: StepCardProps) {
  const Icon = step.icon;
  const num = String(index + 1).padStart(2, "0");

  return (
    <motion.div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      variants={{
        hidden: { opacity: 0, y: 28 },
        show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } }
      }}
      animate={active ? { y: -8 } : { y: 0 }}
      transition={{ duration: 0.7, ease: EASE }}
      className="group relative cursor-default text-center"
    >
      {/* number + label */}
      <div className="mb-4 flex flex-col items-center leading-none">
        <span
          className={`bg-clip-text text-[44px] font-semibold tracking-tighter transition-all duration-700 ${
            active
              ? "bg-gradient-to-b from-white via-[#c4b5fd] to-[#7b61ff] text-transparent"
              : "bg-gradient-to-b from-white/15 to-white/[0.04] text-transparent"
          }`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {num}
        </span>
        <span
          className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.36em] transition-colors duration-500 ${
            active ? "text-[#a78bfa]/80" : "text-white/25"
          }`}
        >
          Шаг
        </span>
      </div>

      {/* icon container */}
      <div className="relative mx-auto h-20 w-20">
        {/* expanding halo ripples (only when active) */}
        <AnimatePresence>
          {active ? (
            <>
              <motion.span
                key="halo-1"
                initial={{ scale: 0.6, opacity: 0.55 }}
                animate={{ scale: 1.65, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
                className="absolute inset-0 rounded-2xl border border-[#a78bfa]/40"
              />
              <motion.span
                key="halo-2"
                initial={{ scale: 0.6, opacity: 0.4 }}
                animate={{ scale: 1.65, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 2.2,
                  delay: 1.1,
                  repeat: Infinity,
                  ease: "easeOut"
                }}
                className="absolute inset-0 rounded-2xl border border-[#7b61ff]/30"
              />
            </>
          ) : null}
        </AnimatePresence>

        {/* glow under card */}
        <motion.div
          aria-hidden
          animate={{ opacity: active ? 1 : 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="pointer-events-none absolute inset-0 -z-10 rounded-2xl blur-2xl"
          style={{ background: "radial-gradient(circle, #7b61ff80 0%, transparent 70%)" }}
        />

        {/* gradient border */}
        <motion.div
          animate={{ opacity: active ? 1 : 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="absolute inset-0 rounded-2xl"
          style={{
            background:
              "linear-gradient(135deg, #c4b5fd, #7b61ff 35%, #3b82f6 70%, #a78bfa)"
          }}
        />

        {/* static border (when inactive) */}
        <motion.div
          animate={{ opacity: active ? 0 : 1 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="absolute inset-0 rounded-2xl border border-white/[0.08]"
        />

        {/* inner card */}
        <div className="absolute inset-[1.5px] flex items-center justify-center rounded-[14px] bg-[#101013]">
          {/* sheen — diagonal light sweep on active */}
          <AnimatePresence>
            {active ? (
              <motion.span
                key="sheen"
                initial={{ x: "-150%", opacity: 0 }}
                animate={{ x: "150%", opacity: [0, 0.6, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.4, ease: EASE, delay: 0.3 }}
                className="pointer-events-none absolute inset-0 rounded-[14px] overflow-hidden"
                style={{
                  background:
                    "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%)"
                }}
              />
            ) : null}
          </AnimatePresence>

          {/* the icon */}
          <motion.span
            animate={active ? { y: [0, -2, 0], scale: 1.05 } : { y: 0, scale: 1 }}
            transition={{
              y: { duration: 2.4, repeat: active ? Infinity : 0, ease: "easeInOut" },
              scale: { duration: 0.6, ease: EASE }
            }}
            className="relative"
          >
            <Icon
              className={`h-7 w-7 transition-colors duration-500 ${
                active ? "text-[#e9e2ff]" : "text-white/85"
              }`}
              strokeWidth={1.4}
            />
          </motion.span>
        </div>

        {/* orbital light dot — refined detail */}
        <AnimatePresence>
          {active ? (
            <motion.div
              key="orbit"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 270, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                rotate: { duration: 5, repeat: Infinity, ease: "linear" },
                opacity: { duration: 0.4 }
              }}
              className="absolute inset-0"
            >
              <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_3px_rgba(196,181,253,0.85)]" />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* title with shimmer on active */}
      <h3
        className={`relative mt-6 inline-block text-[17px] font-semibold transition-colors duration-500 sm:text-[18px] ${
          active ? "text-white" : "text-white/85"
        }`}
      >
        <span className="relative">{step.title}</span>
        <AnimatePresence>
          {active ? (
            <motion.span
              key="title-sheen"
              initial={{ backgroundPosition: "-150% 50%" }}
              animate={{ backgroundPosition: "250% 50%" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, ease: EASE, delay: 0.2 }}
              className="absolute inset-0 bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(110deg, transparent 35%, #ffffff 50%, transparent 65%)",
                backgroundSize: "200% 100%",
                WebkitBackgroundClip: "text"
              }}
            >
              {step.title}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </h3>

      {/* description */}
      <p
        className={`mx-auto mt-3 max-w-[300px] text-[13.5px] leading-relaxed transition-colors duration-500 sm:text-[14px] ${
          active ? "text-white/75" : "text-white/55"
        }`}
      >
        {step.description}
      </p>

      {/* progress bar */}
      <div className="mx-auto mt-6 h-px w-16 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          initial={{ width: "0%" }}
          animate={{ width: active ? "100%" : "0%" }}
          transition={{
            duration: active ? 3 : 0.5,
            ease: active ? "linear" : EASE
          }}
          className="h-full"
          style={{
            background:
              "linear-gradient(90deg, #7b61ff 0%, #a78bfa 50%, #c4b5fd 100%)"
          }}
        />
      </div>
    </motion.div>
  );
}

interface SpotlightProps {
  index: number;
  reduce: boolean;
}

function Spotlight({ index, reduce }: SpotlightProps) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const xPercent = (col + 0.5) * (100 / 3);
  const yPercent = row === 0 ? 32 : 72;

  if (reduce) return null;

  return (
    <motion.div
      animate={{ left: `${xPercent}%`, top: `${yPercent}%` }}
      transition={{ duration: 1.6, ease: EASE }}
      className="pointer-events-none absolute h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7b61ff]/16 blur-[90px]"
    />
  );
}

interface ConnectorsProps {
  activeIndex: number;
  reduce: boolean;
}

function Connectors({ activeIndex, reduce }: ConnectorsProps) {
  // 6 cards in 3x2; connectors from activeIndex → next index in same row
  // Row 0: 0->1->2 ;  Row 1: 3->4->5
  // Vertical bridge: 2->3 (last of row 0 to first of row 1)
  const segments: Record<number, { x1: string; y1: string; x2: string; y2: string }> = {
    0: { x1: "22%", y1: "32%", x2: "44%", y2: "32%" },
    1: { x1: "56%", y1: "32%", x2: "78%", y2: "32%" },
    // 2 -> 3 jumps row, no horizontal connector
    3: { x1: "22%", y1: "73%", x2: "44%", y2: "73%" },
    4: { x1: "56%", y1: "73%", x2: "78%", y2: "73%" }
    // 5 wraps to 0, no connector
  };
  const traveling = segments[activeIndex];

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="connector-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(167,139,250,0)" />
          <stop offset="50%" stopColor="rgba(167,139,250,0.28)" />
          <stop offset="100%" stopColor="rgba(167,139,250,0)" />
        </linearGradient>
        <radialGradient id="travel-light">
          <stop offset="0%" stopColor="rgba(255,255,255,1)" />
          <stop offset="40%" stopColor="rgba(196,181,253,0.9)" />
          <stop offset="100%" stopColor="rgba(196,181,253,0)" />
        </radialGradient>
      </defs>
      {/* base dashed lines */}
      <line x1="22%" y1="32%" x2="44%" y2="32%" stroke="url(#connector-grad)" strokeWidth="1" strokeDasharray="2 4" />
      <line x1="56%" y1="32%" x2="78%" y2="32%" stroke="url(#connector-grad)" strokeWidth="1" strokeDasharray="2 4" />
      <line x1="22%" y1="73%" x2="44%" y2="73%" stroke="url(#connector-grad)" strokeWidth="1" strokeDasharray="2 4" />
      <line x1="56%" y1="73%" x2="78%" y2="73%" stroke="url(#connector-grad)" strokeWidth="1" strokeDasharray="2 4" />

      {/* traveling light dot */}
      {!reduce && traveling ? (
        <motion.circle
          key={`travel-${activeIndex}`}
          r="9"
          fill="url(#travel-light)"
          initial={{ cx: traveling.x1, cy: traveling.y1, opacity: 0 }}
          animate={{
            cx: [traveling.x1, traveling.x2],
            cy: [traveling.y1, traveling.y2],
            opacity: [0, 1, 1, 0]
          }}
          transition={{ duration: 2.6, ease: EASE, times: [0, 0.15, 0.85, 1] }}
        />
      ) : null}
    </svg>
  );
}
