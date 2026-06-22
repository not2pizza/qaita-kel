# Antigravity Coffee — План мобильного приложения для клиентов

Спутник к киоску. **Тот же Supabase-бэкенд**, та же программа лояльности и каталог.
Киоск = распознавание лица у кассы; мобильное приложение = личный кабинет, заказ
заранее, оплата, баллы и история в кармане у клиента.

---

## 0. Решения по умолчанию (можно поменять)

| Вопрос | Выбор по умолчанию | Почему | Альтернатива |
|---|---|---|---|
| Стек | **React Native + Expo (TypeScript)** | Переиспользуем TS-типы и `supabaseService` из киоска; один язык; OTA-обновления; быстрый выход на iOS+Android | Flutter; нативный Swift/Kotlin |
| Backend | **Существующий Supabase** | Уже есть customers, loyalty, orders, modifiers, branches | — |
| Авторизация | **Телефон + OTP (SMS)** | Совпадает с identity киоска (телефон уникален) → аккаунты автоматически связываются | Email magic-link; Apple/Google Sign-in |
| Модель заказа | **Order-ahead + оплата в приложении, самовывоз (pickup)** | Кофейня; «закажи — забери без очереди» | + доставка (фаза 2) |
| Оплата | **Казахстан: Kaspi Pay / Halyk (Epay)** | Локальный рынок (адрес/язык KK) | Stripe (международно), Apple Pay/Google Pay |
| Языки | **EN / RU / KK** | Как в киоске | + добавить позже |
| Дизайн | **Брендинг из `brand_settings`** | Белый лейбл из коробки, как киоск | — |

---

## 1. Видение и цели

**Для клиента:** заказать любимый кофе за 15 секунд, не стоять в очереди, копить и
тратить баллы, видеть статус заказа в реальном времени.

**Для бизнеса:** удержание (лояльность, пуши, win-back), рост среднего чека
(апселл модификаторов, рекомендации), данные о клиентах, разгрузка очереди в часы пик.

**Метрики успеха (KPI):**
- % заказов через приложение от общего числа
- Retention D7 / D30, частота визитов
- Средний чек в приложении vs офлайн
- Конверсия: открыл → заказал
- Доля повторных заказов (reorder / «ваше обычное»)
- Использование баллов (issued vs redeemed)

---

## 2. Архитектура (высокий уровень)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Киоск iPad │     │ Мобильное    │     │  Owner-панель   │
│ (React/Vite)│     │ приложение   │     │  (Next.js, веб) │
│ распознавание│     │ (Expo RN)    │     │  отчёты/кухня   │
└──────┬──────┘     └──────┬───────┘     └────────┬────────┘
       │                   │                      │
       └───────────────────┼──────────────────────┘
                           ▼
              ┌───────────────────────────┐
              │         SUPABASE          │
              │ Auth · Postgres · Realtime│
              │ Storage · Edge Functions  │
              └───────────────────────────┘
```

- **Auth** — Supabase Auth (телефон OTP), `auth.users` ↔ `customers`.
- **Postgres** — общий каталог, лояльность, заказы.
- **Realtime** — статус заказа «готовится → готов» прилетает в приложение мгновенно.
- **Storage** — фото товаров, логотип, аватары, селфи для face-enroll.
- **Edge Functions** — серверная логика: создание заказа+оплата (нельзя доверять
  клиенту в расчёте цены/баллов), вебхуки оплаты, начисление баллов, пуши.

> **Принцип:** деньги, баллы и цены считаются **на сервере** (Edge Function/RPC),
> не на клиенте. Клиент присылает «что заказал», сервер считает итог и баллы.

---

## 3. Аутентификация и связка аккаунтов

1. Пользователь вводит телефон → Supabase шлёт **OTP по SMS** → подтверждает.
2. После входа есть `auth.users.id`. Связываем с `customers`:
   - Если `customers.phone` уже есть (заходил через киоск) → **привязываем** этот
     профиль к `auth_user_id` (баллы и история сразу на месте).
   - Если нет → создаём `customers` + welcome-бонус.
3. Добавить в `customers` колонку **`auth_user_id uuid references auth.users`**
   (nullable; киоск-гости без авторизации остаются с null).
4. **Гостевой режим**: можно листать меню без входа; вход обязателен на оформлении.
5. **Удаление аккаунта** (требование App Store/Google Play): экран + Edge Function,
   которая чистит/анонимизирует `customers`, `face_profiles`, токены.

SMS-провайдер: Supabase Auth поддерживает Twilio/Vonage/MessageBird; для Казахстана
проверить локального SMS-провайдера (часто дешевле через локального агрегатора +
кастомный OTP через Edge Function).

---

## 4. Модель данных: переиспользуем + добавляем

### Переиспользуем как есть
`branches`, `products`, `branch_products`, `modifier_*`, `customers`, `loyalty_settings`,
`loyalty_tiers`, `stamp_cards`, `customer_stamps`, `loyalty_rules`, `rewards`,
`bonus_transactions`, `orders`, `order_items`, `order_item_modifiers`.

### Что добавить (миграции)
```sql
-- Привязка профиля к аккаунту авторизации
alter table customers add column auth_user_id uuid references auth.users(id);
alter table customers add column email text;
alter table customers add column avatar_url text;
alter table customers add column marketing_opt_in boolean default false;

-- Статус заказа: сейчас orders.status = boolean (оплачен/нет). Для order-ahead
-- нужен полноценный жизненный цикл. Добавляем:
alter table orders add column fulfillment_status text default 'cart'
  check (fulfillment_status in
    ('cart','pending_payment','paid','preparing','ready','completed','cancelled','refunded'));
alter table orders add column order_type text default 'pickup'
  check (order_type in ('pickup','dine_in','delivery'));
alter table orders add column pickup_time timestamptz;       -- к какому времени готовить
alter table orders add column order_number text;             -- человеку: "A-042"
alter table orders add column channel text default 'kiosk';  -- 'kiosk' | 'mobile'
alter table orders add column notes text;                    -- комментарий бариста

-- Платежи
create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  provider text,                 -- 'kaspi' | 'halyk' | 'stripe' | 'apple_pay'
  provider_ref text,             -- id транзакции у провайдера
  amount numeric not null,
  currency text default 'KZT',
  status text default 'pending', -- 'pending'|'succeeded'|'failed'|'refunded'
  raw jsonb,                     -- сырой ответ вебхука
  created_at timestamptz default now()
);

-- Push-уведомления
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  token text not null,
  platform text,                 -- 'ios' | 'android'
  created_at timestamptz default now(),
  unique (token)
);

-- Избранное
create table favorites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  unique (customer_id, product_id)
);

-- Промокоды / реферальная программа (опц.)
create table promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  effect jsonb not null,         -- {type:'discount',value:500} / {type:'points',value:200}
  max_uses int, used_count int default 0,
  per_user_limit int default 1,
  starts_at timestamptz, ends_at timestamptz,
  is_active boolean default true
);
create table customer_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references customers(id),
  referred_id uuid references customers(id),
  rewarded boolean default false,
  created_at timestamptz default now()
);
```

### Безопасность данных (RLS — обязательно для мобайла!)
Сейчас киоск ходит anon-ключом. Мобайл = реальные пользователи → **включить RLS**:
- `customers`: пользователь видит/меняет **только свою** строку (`auth_user_id = auth.uid()`).
- `orders`/`order_items`/`bonus_transactions`/`favorites`/`push_tokens`: только свои.
- `products`/`branches`/`modifier_*`/`rewards`/`loyalty_*`: публичное чтение (меню).
- `face_profiles`: только владелец (биометрия!).
- Запись заказа/оплаты/баллов — **только через Edge Function** (service role), не напрямую.

---

## 5. Функционал по экранам

### A. Онбординг и регистрация
- Сплэш с брендом → 2–3 слайда (что даёт приложение: баллы, без очереди).
- Вход по телефону + OTP. Запрос разрешений (пуши, геолокация) — по контексту, не сразу.
- Welcome-бонус начисляется и показывается анимацией.

### B. Главная
- Приветствие («С возвращением, Имя»), баллы и тир на видном месте.
- **«Ваше обычное»** — повтор частого заказа в 1 тап (логика уже есть в `reorder.ts`).
- Карусель акций (`loyalty_rules`/`promo_codes`), баннер ближайшей награды.
- Выбор филиала (по геолокации ближайший), статус «открыто/закрыто» (`open_time`).

### C. Меню
- Категории (Hot/Cold/Blended), поиск, фото/видео товара.
- Цена и наличие из `branch_products` выбранного филиала.
- Карточка товара → **модификаторы** (группы, single/multiple, min/max, доплаты) —
  движок уже спроектирован (`modifier_*`, `fetchProductModifiers`).
- Избранное (сердечко), бейджи «Популярное/Новинка».

### D. Корзина и оформление
- Список позиций с модификаторами, изменение кол-ва.
- Выбор филиала + **время самовывоза** (ASAP / к времени).
- Применение награды/баллов и промокода (расчёт скидки на сервере).
- Итог: подытог, скидка, налог, баллы к начислению.
- Кнопка «Оплатить» → платёжный флоу.

### E. Оплата
- Провайдер (Казахстан): **Kaspi Pay / Halyk Epay**; международно — Stripe + Apple/Google Pay.
- Поток: Edge Function создаёт заказ (`pending_payment`) → инициирует платёж →
  редирект/нативный SDK → **вебхук** провайдера → `payments.status=succeeded` →
  `orders.fulfillment_status=paid` → начисление баллов + пуш.
- Идемпотентность: повторный вебхук не должен задвоить баллы.

### F. Активный заказ (реалтайм)
- Экран статуса: `paid → preparing → ready` с прогрессом и номером заказа («A-042»).
- **Supabase Realtime** на строку заказа → обновление без рефреша.
- Пуш «Ваш заказ готов ☕».

### G. История заказов
- Список прошлых заказов с позициями и модификаторами (есть `fetchRecentOrders`).
- **Повторить заказ** в 1 тап. Чек/детали. Фильтр по филиалу/датам.

### H. Лояльность
- Баланс баллов, прогресс до следующего тира (есть `getTierProgressInfo`).
- **Штамп-карты** «5+1» (`stamp_cards`/`customer_stamps`) — визуальный прогресс.
- Каталог наград (`rewards`) — обмен баллов.
- Промо/акции, **реферальная программа** (пригласи друга → баллы обоим).
- **День рождения** (`customers.birthday`) → бонус (правило в `loyalty_rules`).
- История начислений/списаний (`bonus_transactions`).

### I. Профиль и настройки
- Имя, телефон, email, дата рождения, аватар.
- Язык (EN/RU/KK), тема, согласия (маркетинг, обработка данных).
- **Привязка лица для киоска** (опц., синергия): сделать селфи в приложении →
  дескриптор в `face_profiles` → узнавание на киоске без телефона.
- Управление пушами, удаление аккаунта (GDPR/Store-требование), политика
  конфиденциальности и оферта.

### J. Уведомления (push)
- Статус заказа (готовится/готов).
- Начисление/сгорание баллов, «до награды осталось N».
- Акции/win-back («давно не заходили — вот вам бонус»).
- Реализация: Expo Notifications + токены в `push_tokens`; отправка из Edge Function.

---

## 6. Что нужно дополнить в админке/кухне

Мобайл порождает заказы, которые кто-то должен готовить:
- **Экран кухни/бариста** (в owner-панели или отдельный): входящие заказы,
  кнопки `preparing → ready → completed`, звук нового заказа.
- Управление временем готовки, «стоп-лист» (быстро скрыть товар: `branch_products.is_available`).
- Модерация промокодов, рассылка пушей, просмотр платежей/возвратов.

---

## 7. UX, дизайн, доступность
- Брендинг (цвета/лого/название) из `brand_settings` — белый лейбл.
- Мультиязык (переиспользовать словари из киоска: `i18n/translations.ts`).
- Нативные жесты, скелетоны загрузки, оффлайн-баннер, haptics.
- Доступность: контраст, размеры тач-зон ≥44pt, VoiceOver/TalkBack.
- Тёмная тема (опц.).

---

## 8. Безопасность и приватность (gate для сторов)
- RLS на все пользовательские таблицы (см. §4).
- Биометрия (лицо) — явное согласие, шифрование, право удалить.
- Политика конфиденциальности + оферта (URL в приложении).
- App Privacy («Nutrition Label») в App Store / Data Safety в Google Play.
- Секреты только на сервере (ключи оплаты — в Edge Functions, не в приложении).

---

## 9. Дорожная карта по фазам

### Фаза 0 — Фундамент (1–1.5 нед)
- Expo-проект, навигация, дизайн-система из brand_settings, i18n.
- Supabase клиент, Auth (телефон OTP), связка `auth_user_id`, RLS-политики.
- Миграции из §4.

### Фаза 1 — MVP «Меню + Лояльность» (2–3 нед)
- Меню (филиалы, категории, модификаторы), карточка товара.
- Профиль, баллы, тиры, история заказов (read-only из существующих заказов).
- «Ваше обычное», избранное. **Без оплаты** (показываем меню/лояльность).
- 🎯 Релиз в TestFlight / Google Play Internal.

### Фаза 2 — Заказ и оплата (3–4 нед)
- Корзина, время самовывоза, Edge Function расчёта заказа.
- Интеграция оплаты (Kaspi/Halyk), вебхуки, статусы.
- Реалтайм-статус заказа, пуши, экран кухни в админке.
- 🎯 Боевой релиз order-ahead.

### Фаза 3 — Рост и удержание (2–3 нед)
- Штамп-карты UI, награды-обмен, промокоды, рефералка, день рождения.
- Сегментные пуши/акции, win-back.
- Face-enroll с телефона (синергия с киоском).

### Фаза 4 — Расширения (по желанию)
- Доставка, чаевые, подарочные карты, подписка на кофе, Apple/Google Wallet-пасс,
  виджеты, Apple Watch, аналитика/А-Б тесты.

---

## 10. Структура кода (переиспользование с киоском)
Рекомендация — **монорепо** с общим пакетом:
```
/packages/shared    → типы, supabaseService, i18n, loyalty-логика, reorder
/apps/kiosk         → текущий Vite-киоск
/apps/mobile        → Expo RN приложение
/apps/owner         → Next.js owner-панель (будущее)
```
Так логика лояльности/каталога не дублируется. (Можно начать отдельным репо и
вынести shared позже, если монорепо сейчас тяжело.)

---

## 11. Риски и открытые вопросы
- **Оплата в Казахстане**: уточнить провайдера (Kaspi API доступ, договор), валюта KZT.
- **SMS OTP**: стоимость/провайдер; антифрод (лимиты на отправку).
- **RLS-миграция**: киоск сейчас на anon — при включении RLS не сломать киоск
  (киоску дать отдельную политику/сервисный путь).
- **Номера заказов** общие для киоска и мобайла (единая нумерация на филиал/день).
- **Расчёт цены/баллов на сервере** — переписать `createOrder` как Edge Function/RPC.
- Комиссии сторов на in-app платежи: физические товары (кофе) обычно вне правил
  IAP (можно сторонний эквайринг), но проверить актуальные правила Apple/Google.

---

## 12. Definition of Done (критерии запуска MVP)
- [ ] Вход по телефону, профиль и баллы видны, история подтягивается.
- [ ] Меню с модификаторами и ценами по филиалу.
- [ ] Заказ → оплата → статус в реалтайме → баллы начислены (фаза 2).
- [ ] RLS включён, секреты на сервере, удаление аккаунта работает.
- [ ] EN/RU/KK, брендинг из brand_settings.
- [ ] Политика конфиденциальности + App Privacy заполнены.
- [ ] Прошли ревью App Store и Google Play.

---

### Следующий шаг
Сказать «делаем» → я подниму Expo-проект (Фаза 0): навигация, Supabase Auth по
телефону, дизайн-система из brand_settings, i18n, и миграции из §4. Дальше по фазам.
