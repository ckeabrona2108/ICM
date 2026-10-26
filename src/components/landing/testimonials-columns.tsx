import Image from "next/image";

type Testimonial = {
  name: string;
  text: string;
  avatar: string | null;
};

// Тексты из отзывов ВКонтакте (скриншоты лежат в /landing/reviews), поправлены только опечатки.
const TESTIMONIALS: Testimonial[] = [
  {
    name: "Михаил Бегунков",
    avatar: "/landing/reviews/avatars/review-01.png",
    text: "Один из самых лучших дистрибьюторов, делают всё качественно и быстро. Большое количество площадок, а главное — скорость обработки и удобный интерфейс. Буду пользоваться дальше и советую всем."
  },
  {
    name: "Egor Potapov",
    avatar: "/landing/reviews/avatars/review-02.png",
    text: "Одни из лучших в своём деле! Всё, что отгружал, было выпущено в назначенные сроки в лучшем виде. Ребята знают свою работу на 100%. Всем советую."
  },
  {
    name: "Марк Карих",
    avatar: "/landing/reviews/avatars/review-06.png",
    text: "Спасибо вам огромное, релиз вышел без задержек, со всем помогли, объяснили. Сделали всё качественно, реально лучший дистрибьютор."
  },
  {
    name: "Никита Полтинин",
    avatar: "/landing/reviews/avatars/review-04.png",
    text: "Добросовестная дистрибуция, всегда делают быстро и качественно, помогают при наличии проблем с релизом. Крайне рекомендую."
  },
  {
    name: "Maksim Selivanov",
    avatar: "/landing/reviews/avatars/review-05.png",
    text: "Очень качественная дистрибуция. При выгрузке возникли проблемы, но модерация быстро помогла справиться. Респект! Обязательно ещё обращусь."
  },
  {
    name: "Егор Русаков",
    avatar: null,
    text: "Как постоянный клиент могу сказать, что ребята делают максимально качественно и быстро свою работу. В случае каких-то проблем всегда помогают выпустить релиз. Большой респект команде ICECREAMMUSIC."
  },
  {
    name: "Марсель Рахматуллин",
    avatar: "/landing/reviews/avatars/review-07.png",
    text: "Первый раз заливал трек — всё объяснили, показали. Рахматы вам!"
  },
  {
    name: "Сеня Кислицин",
    avatar: null,
    text: "Один из самых лучших дистрибьюторов, всем рекомендую! Сделали всё на высоком уровне, быстро и качественно. Поддержка вообще пушка — всегда отвечают, подсказывают и помогают."
  }
];

const COLUMNS = [
  { items: [TESTIMONIALS[0], TESTIMONIALS[3], TESTIMONIALS[6]], duration: "46s", className: "" },
  { items: [TESTIMONIALS[1], TESTIMONIALS[4], TESTIMONIALS[7]], duration: "54s", className: "hidden md:block" },
  { items: [TESTIMONIALS[2], TESTIMONIALS[5]], duration: "42s", className: "hidden lg:block" }
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function TestimonialCard({ item }: { item: Testimonial }) {
  return (
    <figure className="rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(20,21,32,0.96),rgba(13,14,22,0.96))] p-6 shadow-[0_24px_60px_-34px_rgba(0,0,0,0.8)]">
      <blockquote className="text-[15px] leading-relaxed text-white/[0.84] sm:text-[16px]">{item.text}</blockquote>
      <figcaption className="mt-5 flex items-center gap-3 border-t border-white/[0.06] pt-4">
        {item.avatar ? (
          <Image
            src={item.avatar}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-full border border-white/10 object-cover"
          />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-[#2a2c38] text-[14px] font-bold text-[#c4b5fd]">
            {initials(item.name)}
          </span>
        )}
        <span>
          <span className="block text-[15px] font-semibold text-white">{item.name}</span>
          <span className="block text-[12.5px] text-white/45">Артист · отзыв ВКонтакте</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function TestimonialsColumns() {
  return (
    <div className="relative mx-auto h-[620px] max-w-6xl overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(123,97,255,0.18),transparent_45%),radial-gradient(circle_at_75%_70%,rgba(255,59,92,0.1),transparent_40%)] blur-3xl" />
      <div className="relative grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {COLUMNS.map((column, index) => (
          <div key={index} className={`group ${column.className}`}>
            {/* Список продублирован: колонка едет на -50% и бесшовно начинается заново. */}
            <div
              className="testimonials-scroll flex flex-col gap-5 group-hover:[animation-play-state:paused]"
              style={{ animationDuration: column.duration }}
            >
              {[...column.items, ...column.items].map((item, itemIndex) => (
                <div key={`${item.name}-${itemIndex}`} aria-hidden={itemIndex >= column.items.length || undefined}>
                  <TestimonialCard item={item} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
