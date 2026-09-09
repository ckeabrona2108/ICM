# SFEROOM Feed Audit

Дата аудита: 28 июля 2026  
Локальный объект сравнения: `http://localhost:3001/feed`  
Референс: [SFEROOM Feed](https://lk.sferoom.space/feed)

## Цель

Проверить текущую реализацию публичной ленты `/feed` в ICM DISTRO относительно модели и UX SFEROOM Feed и разделить выводы на:

- что уже реализовано;
- что реализовано частично;
- что отсутствует;
- что работает иначе;
- какие есть технические риски;
- что нужно для выхода на близкий к SFEROOM уровень.

## Источники

1. Живая публичная страница SFEROOM: [https://lk.sferoom.space/feed](https://lk.sferoom.space/feed)
2. Пользовательский HTML-снимок страницы SFEROOM из локального вложения `pasted-text.txt`
3. Текущее приложение:
   - [src/app/feed/page.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/app/feed/page.tsx)
   - [src/app/feed/[id]/page.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/app/feed/%5Bid%5D/page.tsx)
   - [src/app/api/feed/route.ts](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/app/api/feed/route.ts)
   - [src/lib/feed-contract.ts](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/feed-contract.ts)
   - [src/lib/public-feed-service.ts](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/public-feed-service.ts)
   - [src/lib/dashboard-community-service.ts](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/dashboard-community-service.ts)
   - [src/components/feed/public-feed-page.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx)
   - [src/components/feed/feed-audio-player.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/feed-audio-player.tsx)

## Ограничения аудита

- Публичный HTML SFEROOM отдаёт в основном shell-интерфейс, а не полную гидратированную ленту.
- Логин и приватные сценарии SFEROOM не были полноценно прогнаны браузерной автоматизацией в этом цикле, поэтому auth-only сценарии помечены как `не подтверждено до E2E`.
- Текущее локальное API `/api/feed` подтверждено живым ответом на 28 июля 2026, но это не заменяет полный пользовательский E2E прогон.

## Краткий вывод

Текущая `/feed` уже ушла от старого каталога артистов и построена в правильной модели "публичная лента + фильтры + отдельная карточка поста". По архитектурному направлению это уже ближе к SFEROOM, чем к странице каталога.

Главное расхождение сейчас не в роутинге, а в глубине социального слоя:

- в UI уже есть emoji-реакции, но в БД и API пока нет полноценной модели реакций;
- комментарии для постов и релизов отображаются, но UX заметно проще SFEROOM;
- нет полноценных reply threads, сортировок комментариев, реакций на комментарии и богатой social-меты;
- лента перегружается целиком по фильтрам и поиску, а не ведёт себя как зрелый social-feed с устойчивой incremental-state моделью;
- правый сайдбар и карточки уже рабочие, но ещё не совпадают по плотности, ритму и hierarchy с SFEROOM.

## Что уже реализовано

### 1. Публичная лента без авторизации

Реализовано.

Подтверждение:

- `/feed` отрисовывается серверно через [src/app/feed/page.tsx](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/app/feed/page.tsx).
- Публичный JSON отдаётся через [src/app/api/feed/route.ts:14](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/app/api/feed/route.ts:14).
- В payload есть `viewer.authenticated`, а не жёсткая auth-блокировка всего экрана: [src/lib/feed-contract.ts:112](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/feed-contract.ts:112).

### 2. Вкладки `Все / Подписки`

Реализовано.

Подтверждение:

- Контракт scope: [src/lib/feed-contract.ts:1](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/feed-contract.ts:1)
- Auth-gated opening `following`: [src/lib/public-feed-service.ts:174](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/public-feed-service.ts:174)
- Кнопки вкладок: [src/components/feed/public-feed-page.tsx:323](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:323)

### 3. Основные feed-фильтры

Реализовано.

Сейчас есть:

- `Все`
- `Релизы`
- `Видео`
- `Новости`
- `Медиа`

Подтверждение:

- UI фильтров: [src/components/feed/public-feed-page.tsx:51](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:51)
- Серверная фильтрация: [src/lib/public-feed-service.ts:137](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/public-feed-service.ts:137) и [src/lib/dashboard-community-service.ts:185](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/dashboard-community-service.ts:185)

### 4. Отдельные типы карточек

Реализовано.

Сейчас лента делит материалы на:

- `post`
- `release`
- `news`

Подтверждение:

- Контракт item kinds: [src/lib/feed-contract.ts:38](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/feed-contract.ts:38)
- Раздельный UI `PostCard / ReleaseCard / NewsCard`: [src/components/feed/public-feed-page.tsx:385](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:385)

### 5. Публичное чтение комментариев

Реализовано.

Подтверждение:

- Комментарии входят в payload постов и релизов: [src/lib/feed-contract.ts:53](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/feed-contract.ts:53), [src/lib/feed-contract.ts:64](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/feed-contract.ts:64)
- Секция комментариев рендерится и для неавторизованного просмотра: [src/components/feed/public-feed-page.tsx:766](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:766)

### 6. Ограничение интеракций для неавторизованных

Реализовано.

Подтверждение:

- Лайки, комментарии, реакции, share в публичной ленте отправляют на логин: [src/components/feed/public-feed-page.tsx:242](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:242), [src/components/feed/public-feed-page.tsx:269](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:269), [src/components/feed/public-feed-page.tsx:863](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:863)
- Composer скрыт без авторизации: [src/components/feed/public-feed-page.tsx:110](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:110), [src/components/feed/public-feed-page.tsx:345](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:345)

### 7. Отдельная страница публикации

Реализовано.

Подтверждение:

- Карточка имеет permalink `/feed/[id]`: [src/lib/public-feed-service.ts:49](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/public-feed-service.ts:49), [src/lib/public-feed-service.ts:68](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/public-feed-service.ts:68), [src/lib/public-feed-service.ts:89](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/public-feed-service.ts:89)

## Что реализовано частично

### 1. Реакции как в SFEROOM

Частично.

На UI уже есть набор emoji-реакций и popover выбора:

- `❤️ 🔥 😂 😮 😢 👍 🎉 💎`

Подтверждение:

- Набор реакций: [src/components/feed/public-feed-page.tsx:38](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:38)
- Popup выбора: [src/components/feed/public-feed-page.tsx:884](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:884)

Но технически это пока не полноценные реакции:

- в `buildReactionCounts()` реальные счётчики есть только у `heart`;
- все остальные реакции всегда `0`;
- API лайка бинарный, а не типизированный по emoji.

Подтверждение:

- искусственные counts: [src/components/feed/public-feed-page.tsx:63](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:63)
- like post route используется без reaction payload: [src/components/feed/public-feed-page.tsx:244](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:244)
- like release route тоже бинарный: [src/components/feed/public-feed-page.tsx:257](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:257)

Вывод: визуально блок похож на SFEROOM, архитектурно пока нет.

### 2. Комментарии

Частично.

Есть:

- список комментариев;
- форма добавления комментария к посту;
- переключение открытия секции комментариев;
- публичное чтение.

Но отсутствуют или не подтверждены:

- threaded replies;
- лайки комментариев;
- reply-to-comment UX;
- раскрытие полного списка через lazy load;
- сортировка `Сначала новые / Сначала старые`.

Подтверждение:

- comments UI простой и плоский: [src/components/feed/public-feed-page.tsx:766](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:766)
- post comment create есть только у постов: [src/components/feed/public-feed-page.tsx:269](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:269)
- release card отображает комментарии, но без формы публикации в этом компоненте: [src/components/feed/public-feed-page.tsx:700](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:700)

### 3. Правый сайдбар

Частично.

Есть:

- новые релизы;
- популярные публикации;
- артисты для открытия;
- пост недели.

Подтверждение:

- сайдбар: [src/components/feed/public-feed-page.tsx:436](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:436)

Но модель пока проще SFEROOM:

- нет "Сейчас слушают";
- нет richer recommendation ranking;
- `Пост недели` считается локально от `popularPosts`, а не как отдельная серверная сущность/ранжирование;
- `popularPosts` пустеет, если в feed мало постов.

### 4. Плеер релиза в ленте

Частично.

Плюсы:

- есть кастомный player;
- есть timeline и volume;
- предусмотрен `onLoadError`.

Подтверждение:

- компонент плеера: [src/components/feed/feed-audio-player.tsx:14](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/feed-audio-player.tsx:14)
- использование в release card: [src/components/feed/public-feed-page.tsx:691](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:691)

Но по зрелости он пока уступает SFEROOM:

- нет состояния buffering/loading state кроме текста `Подготавливаем аудио…`;
- нет wave/preview UX;
- нет отдельной обработки cross-origin/runtime playback regressions;
- не подтверждён стабильный autoplay/seek/metadata сценарий на полном наборе релизов.

### 5. Загрузка ленты и пагинация

Частично.

Есть:

- серверный cursor;
- кнопка `Показать ещё`;
- skeleton.

Подтверждение:

- cursor encode/decode: [src/lib/public-feed-service.ts:122](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/public-feed-service.ts:122)
- `hasMore` и `nextCursor`: [src/lib/public-feed-service.ts:231](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/public-feed-service.ts:231)
- UI `Показать ещё`: [src/components/feed/public-feed-page.tsx:421](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:421)

Но SFEROOM-паттерн ближе к непрерывной ленте, а не к кнопочной догрузке.

## Что отсутствует

### 1. Полноценная модель реакций в БД и API

Отсутствует.

Сейчас контракт feed не содержит reaction breakdown на уровне item, только `likesCount`: [src/lib/feed-contract.ts:42](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/feed-contract.ts:42)

Для parity с SFEROOM нужны:

- `reactionType`;
- агрегированные counts по каждому emoji;
- реакция пользователя;
- API toggle/change reaction без потери counts.

### 2. Полноценный social detail view уровня SFEROOM

Отсутствует.

В текущей детальной странице используется тот же feed item, но без расширенной модели social detail. Нет:

- блоков ответов на комментарии;
- сортировки треда;
- раскрытия "показать все комментарии";
- статистики реакций верхнего уровня как самостоятельного social блока;
- comment attachments/replies UX.

### 3. Отдельная серверная модель "пост недели"

Отсутствует.

Сейчас `postOfWeek` вычисляется на клиенте из `popularPosts` и только если лайков больше 1: [src/components/feed/public-feed-page.tsx:129](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:129)

Это визуальный surrogate, а не реальная сущность/ранжирование.

### 4. Продвинутые social действия

Не реализованы или не подтверждены:

- reply to comment;
- reactions on comments;
- сохранение/закладки;
- pin/feature post;
- moderation states on feed item;
- report abuse;
- hashtag/topics;
- repost/share counters;
- серверный popularity ranking для mixed content.

### 5. Rich media policy как у зрелой ленты

Частично отсутствует.

Хотя типы `image | audio | video` есть, контракт поста всё ещё single-media:

- один `mediaType`;
- один `mediaUrl`;
- один `mediaName`.

Подтверждение:

- [src/lib/feed-contract.ts:50](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/feed-contract.ts:50)

Это слабее, чем multi-attachment social feed.

## Что работает иначе, чем у SFEROOM

### 1. Лента агрегируется как merge community + platform news

Сейчас `/feed` собирается из двух разных источников:

- community payload;
- public news.

Подтверждение:

- merge в одном payload: [src/lib/public-feed-service.ts:195](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/public-feed-service.ts:195)

Это рабочая модель, но она даёт другой content rhythm, чем у SFEROOM, где feed выглядит как единая social timeline.

### 2. Фильтр `Подписки` требует жёсткий redirect/login

Сейчас при попытке открыть `following` без логина пользователь уводится в auth flow:

- UI prompt: [src/components/feed/public-feed-page.tsx:288](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:288)
- API 401: [src/app/api/feed/route.ts:20](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/app/api/feed/route.ts:20)

Это допустимо, но UX SFEROOM обычно держит человека в продукте мягче и показывает встроенный gate.

### 3. Release cards сильнее завязаны на наличия cover+audio

Сейчас релиз попадает в ленту только если есть и обложка, и аудио:

- [src/lib/dashboard-community-service.ts:181](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/dashboard-community-service.ts:181)
- [src/lib/dashboard-community-service.ts:435](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/dashboard-community-service.ts:435)

Это соответствует последнему бизнес-требованию, но означает, что feed может быть заметно уже, чем в SFEROOM, если контент-банк неполный.

### 4. Composer вынесен только в кабинетный режим авторизованного владельца

Это осознанное отличие от публичной страницы.

Подтверждение:

- `canPublish` зависит от auth и `ownedProfiles`: [src/components/feed/public-feed-page.tsx:110](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:110)

С точки зрения продукта это правильно, но это значит, что публичный `/feed` и кабинетная social activity сейчас разделены сильнее, чем в едином social app UX.

## Технические риски

### 1. Реакции визуально богаче, чем реальные данные

Самый явный архитектурный риск.

Пользователь видит SFEROOM-подобный reaction bar, но хранится только бинарный like. Это создаёт product debt и риск ложного UX-обещания.

### 2. Фолбэки на частично несовместимую БД

В `dashboard-community-service` есть защитные ветки на отсутствие таблицы комментариев постов и отсутствие колонки привязанного релиза:

- [src/lib/dashboard-community-service.ts:200](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/dashboard-community-service.ts:200)
- [src/lib/dashboard-community-service.ts:206](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/dashboard-community-service.ts:206)
- fallback loading: [src/lib/dashboard-community-service.ts:212](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/dashboard-community-service.ts:212)

Это полезно для отказоустойчивости, но само наличие такого fallback значит, что runtime-схема БД уже не считается строго синхронизированной.

### 3. Сильная client-side state orchestration в одной странице

`public-feed-page.tsx` держит в одном клиентском компоненте:

- фильтры;
- поиск;
- загрузку;
- composer state;
- draft comments;
- реакции;
- expanded comments;
- auth prompt;
- share state;
- suppress release state.

Подтверждение:

- state cluster: [src/components/feed/public-feed-page.tsx:88](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/components/feed/public-feed-page.tsx:88)

Это уже рабочий объём, но при дальнейшем росте social-механик страницу лучше будет разбивать на data/view-model слои.

### 4. Search/filter делаются после полной агрегации

Сначала грузится full core feed, потом происходит фильтрация:

- [src/lib/public-feed-service.ts:215](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/public-feed-service.ts:215)
- [src/lib/public-feed-service.ts:217](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/public-feed-service.ts:217)

Это масштабируется хуже, чем query-native feed pipeline.

### 5. News content социально беднее постов и релизов

`news` item сейчас не имеет комментариев/лайков/реакций в контракте и фактически ведёт себя как editorial card:

- [src/lib/public-feed-service.ts:83](/Users/vaceslavsmancar/Desktop/ICM%20DISTRO/src/lib/public-feed-service.ts:83)

Если цель именно единая музыкальная social лента, news-поток может восприниматься чужеродно.

## Что нужно для функционального паритета с SFEROOM

### Приоритет 1

1. Перевести реакции на реальную типизированную модель в БД.
2. Разделить social counters на:
   - total reactions;
   - counts by emoji;
   - current viewer reaction.
3. Доделать комментарии:
   - replies;
   - раскрытие полного списка;
   - сортировку;
   - стабильный create flow и для release detail.
4. Сделать detail page отдельным social-screen, а не просто "одна карточка в той же сетке".
5. Убрать fallback-зависимость от несовпавшей БД схемы и привести runtime миграции к жёстко ожидаемому состоянию.

### Приоритет 2

1. Перевести `Показать ещё` в infinite scroll или hybrid lazy loading.
2. Перенести ranking `popularPosts`, `postOfWeek`, recommendations на сервер.
3. Вынести feed-query pipeline в отдельный слой, чтобы фильтрация шла до merge/page slicing.
4. Стабилизировать player metrics, buffering state и error reporting.

### Приоритет 3

1. Добавить сохранения, репосты, теги, жалобы, moderation actions.
2. Добавить richer right-rail:
   - сейчас слушают;
   - горячие публикации;
   - тематические подборки;
   - новые авторы.
3. Добавить социальную аналитику на detail page.

## UI-аудит и рекомендации

### Что уже хорошо

- Темная визуальная система уже ближе к SFEROOM, чем ранняя версия.
- Разделение `post / release / news` правильное.
- Публичный режим чтения и auth-gated action flow соответствует задаче.
- Release card стала компактнее и логичнее.

### Что ещё слабее SFEROOM

1. Плотность интерфейса всё ещё ниже.
2. Комментарии визуально слишком "карточные", а не "тредовые".
3. Reaction bar пока выглядит богаче, чем он реально работает.
4. News cards визуально выпадают из общей социальной системы.
5. Правая колонка пока полезная, но не создаёт ощущения живого feed ecosystem.

### Что я бы улучшил дальше

1. Сделать detail page ближе к social post page:
   - контент;
   - reactions summary;
   - comment thread;
   - full-height conversation block.
2. Для комментариев перейти к виду ближе к SFEROOM:
   - компактнее вертикальный ритм;
   - явные reply links;
   - вложенность;
   - сортировка.
3. Для release card:
   - сократить верхний meta-row;
   - сильнее связать cover, title и player в единый block;
   - вынести secondary info ниже.
4. Для news:
   - либо сделать их социальной карточкой платформы;
   - либо слабее смешивать с user-generated feed.

## Статус паритета

- Архитектурное направление: `хорошее`
- Функциональный паритет с SFEROOM: `средний`
- Визуальный паритет с SFEROOM: `средний`
- Социальная зрелость interactions: `ниже референса`
- Техническая готовность к росту feed-функций: `средняя, но требует рефакторинга data-layer`

## Итог

Текущая `/feed` уже является полноценной публичной лентой и больше не выглядит как каталог артистов. Основа сделана правильно. Основной разрыв с SFEROOM теперь лежит не в маршрутах и не в названии раздела, а в глубине социальной модели и зрелости feed-архитектуры.

Если цель именно "1 в 1 по ощущению с SFEROOM", следующая критическая работа должна идти в таком порядке:

1. настоящие emoji-реакции;
2. полноценные комментарии и detail page;
3. серверный ranking и social metadata;
4. доработка right-rail и плотности UI;
5. очистка fallback-логики и синхронизация БД-схемы.
