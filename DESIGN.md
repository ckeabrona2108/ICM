# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-06-21
- Primary product surfaces: публичный лендинг, hero, секции доверия после hero, CTA-поток в регистрацию
- Evidence reviewed:
  - [src/app/page.tsx](/Users/vaceslavsmancar/Desktop/ICM DISTRO/src/app/page.tsx:1)
  - [src/components/landing/hero-collage.tsx](/Users/vaceslavsmancar/Desktop/ICM DISTRO/src/components/landing/hero-collage.tsx:1)
  - [src/components/landing/how-it-works.tsx](/Users/vaceslavsmancar/Desktop/ICM DISTRO/src/components/landing/how-it-works.tsx:1)
  - [src/components/landing/faq-accordion.tsx](/Users/vaceslavsmancar/Desktop/ICM DISTRO/src/components/landing/faq-accordion.tsx:1)
  - [src/components/landing/advantage-cards.tsx](/Users/vaceslavsmancar/Desktop/ICM DISTRO/src/components/landing/advantage-cards.tsx:1)
  - [src/app/layout.tsx](/Users/vaceslavsmancar/Desktop/ICM DISTRO/src/app/layout.tsx:1)

## Brand
- Personality: премиальный, уверенный, технологичный, музыкальный, но не кричащий
- Trust signals: большие цифры, прозрачный процесс релиза, понятные статусы, поддержка 7/7, присутствие площадок, договор/верификация
- Avoid: дешёвые маркетинговые паттерны, пустые “вау”-обещания, кислотные цвета, светлый фон, перегруженные сетки, прямое копирование Musmedia

## Product goals
- Goals:
  - Сделать ICE CREAM MUSIC визуально дороже и современнее Musmedia
  - Сохранить hero как основной визуальный актив бренда
  - После hero выстроить SaaS-структуру доверия и конверсии
  - Продавать не только дистрибуцию, но и ощущение рабочего продукта для артиста
- Non-goals:
  - Не менять hero-композицию
  - Не копировать референс секция-в-секцию
  - Не вводить новую визуальную систему отдельно от текущего сайта
- Success signals:
  - Лендинг читается как premium music SaaS
  - Структура после hero снимает основные вопросы до регистрации
  - CTA на регистрацию присутствует в начале, середине и финале без ощущения давления

## Personas and jobs
- Primary personas:
  - независимый артист
  - менеджер артиста
  - маленький лейбл / продюсер
- User jobs:
  - быстро понять, можно ли доверить платформе релиз
  - увидеть, что процесс прозрачен и не хаотичен
  - понять, какие ещё инструменты доступны кроме “отправить музыку”
- Key contexts of use:
  - первый визит с рекламы или рекомендаций
  - сравнение с конкурентами
  - принятие решения о первом релизе

## Information architecture
- Primary navigation: hero -> статистика -> почему нас выбирают -> процесс -> стек продукта -> площадки -> социальное доказательство -> первый релиз -> FAQ -> финальный CTA
- Core routes/screens:
  - `/` лендинг
  - `/register` регистрация
  - `/dashboard/*` продуктовая зона
- Content hierarchy:
  - сначала эмоция и брендовый hero
  - затем доверие через цифры
  - потом аргументы и процесс
  - потом расширение ценности за пределы дистрибуции
  - потом платформы, FAQ и запуск первого релиза

## AI Studio UX
- Source of truth:
  - AI Studio is a native dashboard surface inside ICECREAMMUSIC.
  - Active tab state is URL-driven and should survive refreshes and direct links.
- Primary UX rule:
  - сначала действие, потом настройки.
  - The prompt/composer must be the first thing the user sees on every active AI tab.
- Workspace structure:
  - Chats should feel like a compact ChatGPT-style conversation shell.
  - Image, video, and audio tabs should feel like a focused creation workspace with a thin toolbar and a fixed composer.
  - Do not show big statistics, bonus blocks, or model galleries above the main action area.
- Controls:
  - Model selection should be a compact dropdown or popover.
  - Model parameters should appear only after a model is chosen.
  - References should attach inline near the prompt with small previews.
  - Native, Priority, and Early access are global generation modes, not decorative labels.
- Placement:
  - Limits, bonuses, file counts, and other account stats belong in Profile AI or Settings AI.
  - Token balance and generation cost stay visible near the prompt and in the top dashboard bar.
- Avoid:
  - Repeating the same data in multiple large cards.
  - Showing every control at once if a lighter progressive-disclosure pattern works.
  - SFEROOM-style stacked panels or gold-forward accenting.

## Design principles
- Principle 1: hero остаётся визуальным центром бренда; остальные блоки подчиняются ему, а не спорят с ним
- Principle 2: каждая следующая секция должна усиливать доверие, а не просто добавлять “контент”
- Principle 3: крупная типографика и большие тёмные поверхности важнее дробных декоративных элементов
- Tradeoffs:
  - если блок выглядит эффектно, но не усиливает понятность пути релиза, он проигрывает
  - если референс-паттерн слишком узнаваем, нужно брать логику, а не композицию

## Visual language
- Color: тёмная база, сине-фиолетовые градиенты, умеренные акценты, без ухода в чистый чёрный flat
- Typography: крупные плотные заголовки, короткие абзацы, SaaS-иерархия, сильный контраст цифр
- Spacing/layout rhythm: большие вертикальные интервалы, широкие контейнеры, блоки с воздухом и крупными радиусами
- Shape/radius/elevation: glass-панели, радиусы 24-34px, мягкое внутреннее свечение, тонкие белые бордеры
- Motion: reveal/stagger, мягкий параллакс/свечение, без лишних микроанимаций
- Imagery/iconography: hero-collage сохраняется, иконки служебные, платформы и цифры поддерживают доверие

## Components
- Existing components to reuse:
  - `IcmHeader`
  - `HeroCollage`
  - `HowItWorks`
  - `FaqAccordion`
  - `Reveal`, `Stagger`, `StaggerItem`
- New/changed components:
  - допустимо собирать маркетинговые секции прямо в `src/app/page.tsx`, пока паттерны не стабилизированы
- Variants and states:
  - карточки должны иметь hover-state, но не расползаться по motion
  - CTA-кнопки должны оставаться в логике текущего hero
- Token/component ownership:
  - использовать текущие токены Tailwind и существующие градиенты
  - не заводить отдельный маркетинговый дизайн-слой

## Accessibility
- Target standard: базовый AA-уровень для контраста и читаемости
- Keyboard/focus behavior: CTA, FAQ и ссылки должны быть доступны с клавиатуры
- Contrast/readability: текст на стеклянных панелях не опускать ниже комфортного контраста
- Screen-reader semantics: секции, заголовки и FAQ должны оставаться семантически последовательными
- Reduced motion and sensory considerations: использовать уже существующие `Reveal` и `HowItWorks` с учетом reduced-motion

## Responsive behavior
- Supported breakpoints/devices: mobile-first, tablet, desktop, large desktop
- Layout adaptations:
  - hero сохраняет текущую логику
  - статистика и аргументы должны хорошо складываться в одну колонку на mobile
  - платформы и отзывы не должны терять ритм при переходе на 1-2 колонки
- Touch/hover differences: hover-эффекты не должны быть обязательными для понимания контента

## Interaction states
- Loading: для лендинга не вводить лишние skeleton-блоки
- Empty: если реальные отзывы/цифры не подтверждены, использовать безопасные placeholder-значения и помечать их на замену
- Error: CTA и FAQ не должны ломать flow даже при сетевых проблемах
- Success: к регистрации должен вести ясный сценарий без когнитивного перегруза
- Disabled: не использовать disabled-элементы в маркетинговом narrative без явной причины
- Offline/slow network, if applicable: тяжелые изображения ограничивать hero-коллажем и существующими ассетами

## Content voice
- Tone: уверенный, современный, без инфоцыганской агрессии
- Terminology: релиз, артист, модерация, площадки, кабинет, аналитика, выплаты
- Microcopy rules:
  - короткие, ясные заголовки
  - не обещать того, что продукт не делает
  - каждая секция должна отвечать на конкретный вопрос пользователя

## Implementation constraints
- Framework/styling system: Next.js App Router + Tailwind + существующие landing components
- Design-token constraints: держаться текущих тёмных цветов, стекла, glow и radii
- Performance constraints: не трогать hero-коллаж, не добавлять тяжёлые новые библиотеки
- Compatibility constraints: продолжать использовать существующую систему `Reveal` и icon-based cards
- Test/screenshot expectations:
  - после значимых изменений лендинга нужен typecheck
  - желательно визуально проверить mobile и desktop

## Open questions
- [ ] Уточнить реальные публичные цифры по релизам и артистам для статистического блока
- [ ] Заменить универсальные social-proof тексты на подтверждённые отзывы/кейсы, если они появятся
- [ ] Решить, нужен ли отдельный публичный тарифный блок на лендинге или достаточно onboarding-first сценария
