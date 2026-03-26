# Roomi 🏨

Современная система управления бронированиями для краткосрочной аренды недвижимости с интеграцией Avito.

![Status](https://img.shields.io/badge/status-Production%20%7C%20Active%20development-green)
![Framework](https://img.shields.io/badge/framework-React-blue)
![Database](https://img.shields.io/badge/database-Supabase-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)
![Deploy](https://img.shields.io/badge/deploy-Vercel-black)

**Live:** [app.roomi.pro](https://app.roomi.pro) | [roomi.pro](https://roomi.pro)

---

## 📋 Оглавление

- [Описание](#описание)
- [Основные возможности](#основные-возможности)
- [Технологический стек](#технологический-стек)
- [Установка и настройка](#установка-и-настройка)
- [Структура проекта](#структура-проекта)
- [Интеграция с Avito](#интеграция-с-avito)
- [Messenger Setup](#messenger-setup)
- [API и Edge Functions](#api-и-edge-functions)
- [База данных](#база-данных)
- [Разработка](#разработка)

---

## 🎯 Описание

**Roomi** — веб-приложение для управления бронированиями краткосрочной аренды. **Онбординг**: выбор — добавить объект вручную или загрузить бронирования из Excel (система настроит объекты); затем подключение Avito и других площадок. Включает календарь, аналитику, объекты недвижимости, **интеграцию с Avito** (синхронизация бронирований и календаря) и **чаты Avito Messenger** — просмотр и ответы на сообщения от гостей в одном интерфейсе.

### Ключевые особенности

- 🗓️ **Интерактивный календарь** с визуализацией бронирований
- 🔄 **Синхронизация с Avito** — календарь и бронирования
- 💬 **Чаты Avito** — переписка с гостями (Messenger API), повторная OAuth для доступа к сообщениям
- 📊 **Аналитика** доходов и загруженности
- 🌐 **Мультиязычность** (RU/EN)
- 📱 **Адаптивный дизайн**
- 🎨 **Светлая/тёмная тема** (светлая по умолчанию)
- 📋 **Тарифы** — Demo 5 дней (все возможности, безлимит объектов), отображение плана и даты окончания демо в настройках

---

## ✨ Основные возможности

### 🗓️ Интерактивный календарь

- ✅ **Визуальное отображение бронирований** с цветовой кодировкой по статусам
- ✅ **Диагональный эффект для check-out дней** — уникальная визуализация окончания брони
- ✅ **Поддержка перекрывающихся бронирований** — автоматическое размещение в несколько рядов
- ✅ **Hover tooltips** с детальной информацией о бронировании
- ✅ **Групповое бронирование** — создание брони для нескольких объектов одновременно
- ✅ **Навигация по датам** — месяц назад/вперед, сегодня, неделя назад/вперед
- ✅ **Динамические цены** — поддержка разных цен по дням недели и периодам

### 💰 Управление бронированиями

- ✅ **Создание новых бронирований** с автоматическим расчётом цены
- ✅ **Редактирование и удаление** существующих броней
- ✅ **Автоматический расчёт цены** на основе количества ночей и базовой цены объекта
- ✅ **Ручное изменение итоговой цены** при необходимости
- ✅ **Дополнительные услуги** — добавление extra services к бронированию
- ✅ **Предупреждение о пересечениях** — модальное окно при выборе занятых дат
- ✅ **Поддержка нескольких валют** — RUB, EUR, USD
- ✅ **Импорт из Excel** — массовая загрузка бронирований
- ✅ **Экспорт в iCal** — синхронизация календаря с внешними системами

### 🏠 Управление объектами недвижимости

- ✅ **Добавление новых объектов** с полной информацией
- ✅ **Редактирование параметров** — название, адрес, цена за ночь, минимальный срок
- ✅ **Настройка минимального срока бронирования**
- ✅ **Динамические цены** — установка разных цен по дням недели
- ✅ **Сортировка объектов** — drag & drop для изменения порядка
- ✅ **Статусы объектов** — активен/неактивен
- ✅ **Мягкое удаление** — объекты помечаются как удаленные, но сохраняются в БД

### 🔄 Интеграция с Avito

- ✅ **OAuth 2.0** — подключение аккаунта Avito
- ✅ **Синхронизация календаря** — отправка доступности в Avito
- ✅ **Синхронизация бронирований** — импорт с Avito (webhook + poller)
- ✅ **Чаты Avito Messenger** — вкладка «Сообщения»: список чатов, сообщения, отправка ответов
- ✅ **Повторная авторизация для чатов** — кнопка «Авторизоваться в Avito» для выдачи scope `messenger:read` / `messenger:write` (отдельный OAuth flow с fallback по первой интеграции)
- ✅ **Обработка ошибок** — при отсутствии интеграций показ диалога «Нет подключённых аккаунтов Avito» и переход к объектам
- ✅ **Наценки** — markup к ценам, iCal URL для Avito

### 📊 Аналитика и отчёты

- ✅ **Выручка за текущий месяц** («Выручка март» и т.д.) с процентом изменения к предыдущему периоду
- ✅ **Средняя цена за ночь** — расчёт на основе всех бронирований
- ✅ **Средний доход в день** — понимание ежедневной прибыли
- ✅ **Процент загруженности** — отслеживание занятости объектов
- ✅ **Доход по источникам** — визуализация с прогресс-барами и pie chart
- ✅ **Топ-5 объектов по доходу** — определение самых прибыльных объектов
- ✅ **Сравнение с предыдущим месяцем** — детальный анализ динамики
- ✅ **Выбор периода** — просмотр статистики за последние 12 месяцев
- ✅ **Графики и диаграммы** — визуализация данных с помощью Recharts

### 📋 Список бронирований

- ✅ **Все бронирования** в одном месте с фильтрацией
- ✅ **Фильтры** — все / будущие / прошлые бронирования
- ✅ **Поиск** по имени гостя или объекту
- ✅ **Сортировка** по дате, объекту или источнику
- ✅ **Отображение источника** — бейджи для разных платформ (Avito, Manual, etc.)
- ✅ **Контактная информация** — email и телефон гостей

### ⚙️ Настройки и профиль

- ✅ **Текущий тариф** — отображение плана (Demo 5 дней), даты и времени окончания демо, лимитов и возможностей тарифа
- ✅ **Управление профилем** — редактирование данных пользователя
- ✅ **Настройки интеграций** — управление подключениями к внешним API
- ✅ **Языковые настройки** — переключение между русским и английским
- ✅ **Тема оформления** — светлая/темная тема
- ✅ **Удаление аккаунта** — полное удаление пользователя и данных

### 💬 Сообщения (Avito Messenger)

- ✅ **Список чатов** — по объектам, фильтр по статусу (новый / в работе / закрыт)
- ✅ **Название объявления** — в списке чатов и в шапке показывается `avito_item_title` вместо имени объекта
- ✅ **Переписка** — получение и отправка сообщений через Avito Messenger API
- ✅ **Быстрые ответы** — редактируемые шаблоны (localStorage), управление через модальное окно
- ✅ **Периодическая синхронизация** — чаты и сообщения подтягиваются с Avito (клиентский поллинг)
- ✅ **Серверный поллер** — `avito-message-poller` проверяет новые сообщения каждые 2 мин по крону
- ✅ **Web Push уведомления** — VAPID-based пуши при новых сообщениях, даже при закрытом приложении (PWA)
- ✅ **Управление Push** — включить/отключить/тест в модалке аккаунтов
- ✅ **Поиск в чате** — поиск по тексту с подсветкой совпадений
- ✅ **Мобильный адаптив** — полноэкранный список или чат с кнопкой «Назад»
- ✅ **Пометить все прочитанными** — сброс unread для всех чатов
- ✅ **Доступ к чатам** — при отсутствии scope показывается блок с кнопкой «Авторизоваться в Avito» (OAuth с полным scope, в т.ч. messenger)
- ✅ **Управление аккаунтами** — один Avito аккаунт со списком объектов, платформы «Скоро» (Циан, Суточно, Airbnb, Booking)

### 🔍 Дополнительные функции

- ✅ **Глобальный поиск** по бронированиям, гостям и объектам
- ✅ **Realtime** — уведомления о новых бронированиях с Avito
- ✅ **Звуковые уведомления** о новых лидах
- ✅ **Админ-панель** — управление пользователями (для админов)

---

## 🛠️ Технологический стек

### Frontend

- **React 18.3** — современный UI фреймворк
- **TypeScript 5.8** — строгая типизация
- **Vite 7.x** — сборка и dev-сервер (PWA via `vite-plugin-pwa`, `injectManifest`)
- **React Router DOM 6.30** — маршрутизация
- **Tailwind CSS 3.4** — utility-first стилизация
- **shadcn/ui + Radix UI** — UI компоненты (таблицы, формы, диалоги, селекты и т.д.)
- **Lucide React** — иконки
- **Recharts 3.5** — графики и визуализация данных
- **Абсолютные импорты** — алиасы `@/` и `@components/` (см. `tsconfig.app.json`, `vite.config.ts`)

### State Management & Forms

- **Zustand** — глобальное состояние (auth, theme, sync log)
- **React Hook Form 7.61** — управление формами
- **Zod 3.25** — валидация схем
- **TanStack React Query 5.83** — кэширование и синхронизация данных

### Backend & Database

- **Supabase** — Backend as a Service
  - **PostgreSQL** — реляционная база данных
- **Supabase Auth** — аутентификация пользователей
- **Row Level Security (RLS)** — защита данных на уровне БД
  - **Edge Functions (Deno)** — серверные функции
  - **Realtime subscriptions** — подписки в реальном времени
  - **Vault** — шифрование токенов

### Интеграции

- **Avito API**
  - OAuth 2.0 (в т.ч. повторная авторизация для Messenger scope)
  - Синхронизация календаря и бронирований (webhook + poller)
  - **Messenger API** — чаты, сообщения (scope `messenger:read`, `messenger:write`)
- **Web Push (VAPID)**
  - Подписка через PushManager + сохранение в `push_subscriptions`
  - AES-GCM шифрование payload (RFC 8291)
  - Service Worker `push` / `notificationclick` обработчики

### Утилиты

- **date-fns 3.6** — работа с датами
- **react-day-picker 8.10** — выбор дат
- **xlsx 0.18** — импорт/экспорт Excel
- **i18next 23.11** + **react-i18next 14.1** — интернационализация (RU/EN)
- **fast-levenshtein** — нечеткий поиск
- **@dnd-kit** — drag & drop для сортировки объектов

### DevOps & Deploy

- **Vercel** — хостинг и деплой
  - Edge Middleware — обработка запросов
  - Edge Functions — серверные функции
- **GitHub** — версионирование и CI/CD

### Инструменты разработки

- **TypeScript 5.8** — типизация
- **ESLint 9** — линтинг
- **Vitest** — юнит-тесты (например, `excelParser`, `dateParser`, `guestParser`)
- **PostCSS** — обработка CSS
- **GitHub Actions** — CI (`test-and-build`: lint, typecheck, test, build)

---

## 🚀 Установка и настройка

### Предварительные требования

- Node.js 18+
- npm или yarn
- Аккаунт Supabase (бесплатный)
- Аккаунт Avito Developer (для интеграции с Avito)

### Шаги установки

1. **Клонируйте репозиторий**
```bash
git clone https://github.com/shinkarenko92-cyber/CM_bolt_1.0.1.git
cd CM_bolt_1.0.1
```

2. **Установите зависимости**
```bash
npm install
```

3. **Настройте переменные окружения**

Создайте файл `.env` в корне проекта:

```env
# Supabase
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Avito (публичный, безопасно для frontend)
VITE_AVITO_CLIENT_ID=your_avito_client_id
VITE_AVITO_REDIRECT_URI=https://app.roomi.pro/auth/avito-callback

# Web Push (VAPID public key — безопасно для frontend)
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key
```

4. **Настройте Supabase Secrets**

В Supabase Dashboard → Settings → Secrets добавьте:

- `AVITO_CLIENT_ID` - Your Avito OAuth Client ID
- `AVITO_CLIENT_SECRET` - Your Avito OAuth Client Secret (секретный!)
- `VAPID_PUBLIC_KEY` - VAPID public key (base64url, 65 bytes uncompressed P-256)
- `VAPID_PRIVATE_KEY` - VAPID private key (base64url, 32 bytes)
- `VAPID_EMAIL` - контактный email для VAPID (например `admin@roomi.pro`)
- Для Messenger API используйте те же `AVITO_CLIENT_ID` / `AVITO_CLIENT_SECRET`, но при авторизации запрашивайте scope `messenger:read,messenger:write` (см. `generateMessengerOAuthUrl`).

**Чеклист Avito credentials:**

- [ ] `AVITO_CLIENT_ID` скопирован полностью (без пробелов в начале/конце)
- [ ] `AVITO_CLIENT_SECRET` без лишних кавычек в .env
- [ ] Redirect URI в приложении точно совпадает с настройками в [Avito Developer Portal](https://www.avito.ru/professionals/api)

5. **Примените миграции базы данных**

Выполните SQL миграции из папки `supabase/migrations/` в вашем Supabase проекте через SQL Editor или `supabase db push`. Для полной работы бронирований и истории изменений нужны в том числе:
- `20251224000000_add_booking_audit_log.sql` — таблица `booking_logs`, колонки `created_by`/`updated_by` в `bookings`
- `20260126000000_add_deposit_fields_to_bookings.sql` — колонки `deposit_amount`, `deposit_received`, `deposit_returned` в `bookings`

6. **Разверните Edge Functions**

Разверните все функции из `supabase/functions/` в тот же проект Supabase, что и приложение. Для истории изменений бронирований обязательна функция `log-booking-change`:

```bash
supabase functions deploy log-booking-change --project-ref <ваш-project-ref>
```

Остальные функции — через Supabase Dashboard → Edge Functions или `supabase functions deploy`.

7. **Запустите проект**
```bash
# Основное приложение (Vite)
npm run dev
```

Приложение будет доступно по адресу из вывода Vite (обычно `http://localhost:5173`). Landing и мобильное приложение — в каталогах `landing/` и `roomi-pro-mobile/` (отдельные `package.json`).

### Production Build

```bash
# Сборка основного приложения
npm run build
```

Сборка landing и мобильного приложения — в соответствующих каталогах (`landing/`, `roomi-pro-mobile/`).

---

## 📁 Структура проекта

```
CM_bolt_1.0.1/
├── src/                          # Основное приложение
│   ├── components/               # React компоненты
│   │   ├── AddReservationModal.tsx
│   │   ├── AdminView.tsx
│   │   ├── AnalyticsView.tsx
│   │   ├── Auth.tsx
│   │   ├── AvitoConnectModal.tsx
│   │   ├── AvitoErrorModal.tsx
│   │   ├── BookingsView.tsx
│   │   ├── Calendar.tsx
│   │   ├── Dashboard.tsx
│   │   ├── MessagesView.tsx
│   │   ├── PropertiesView.tsx
│   │   └── ...
│   ├── config/                   # Конфигурация (константы, env)
│   ├── contexts/                 # React контексты
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx
│   ├── hooks/                    # Пользовательские хуки
│   │   ├── useDashboardData.ts   # Загрузка данных дашборда (properties, bookings, guests, profile)
│   │   ├── useAvitoChats.ts      # Синхронизация чатов/сообщений Avito
│   │   ├── useMessageTemplates.ts # Редактируемые шаблоны быстрых ответов (localStorage)
│   │   ├── usePushSubscription.ts # Web Push подписка + авто-синхронизация с БД
│   │   ├── useReservationForm.ts # Синхронизация цен в формах бронирования
│   │   └── use-media-query.ts
│   ├── stores/                   # Zustand stores
│   │   ├── authStore.ts
│   │   ├── themeStore.ts
│   │   └── syncLogStore.ts
│   ├── pages/                    # Страницы (Cleaning и др.)
│   ├── schemas/                  # Zod схемы валидации
│   ├── i18n/                     # Интернационализация
│   │   ├── index.ts
│   │   └── locales/
│   │       ├── en.json
│   │       └── ru.json
│   ├── lib/                      # Библиотеки
│   │   └── supabase.ts
│   ├── services/                 # Сервисы и API
│   │   ├── apiSync.ts
│   │   ├── avito.ts
│   │   ├── avitoApi.ts
│   │   └── avitoErrors.tsx
│   ├── types/                    # TypeScript типы
│   │   └── avito.ts
│   ├── utils/                    # Утилиты
│   │   ├── bookingUtils.ts       # Общие утилиты бронирований (calculateNights, validateDateRange, fetchCalculatedPrice)
│   │   ├── dateParser.ts
│   │   ├── excelParser.ts
│   │   ├── fuzzyMatch.ts
│   │   ├── guestParser.ts
│   │   ├── icalUrl.ts
│   │   └── subscriptionLimits.ts # лимиты и тарифы (Demo, платные)
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── landing/                      # Landing page (отдельный Vite-проект)
│   ├── src/
│   │   ├── components/
│   │   │   ├── landing/          # Landing компоненты
│   │   │   └── ui/               # UI компоненты
│   │   └── ...
│   └── vite.config.ts
├── supabase/
│   ├── functions/                # Edge Functions
│   │   ├── avito_sync/           # Синхронизация с Avito
│   │   ├── avito-oauth-callback/ # OAuth + messenger_auth
│   │   ├── avito-messenger/      # Прокси Messenger API
│   │   ├── avito-messenger-webhook/
│   │   ├── avito-message-poller/ # Серверный поллер сообщений (cron)
│   │   ├── send-push/            # Web Push уведомления (VAPID)
│   │   ├── avito-webhook/        # Webhook бронирований
│   │   ├── avito-poller/         # Poller бронирований
│   │   ├── avito-close-availability/
│   │   ├── ical/                 # iCal экспорт
│   │   ├── import-bookings/      # Импорт бронирований
│   │   └── ...
│   └── migrations/               # SQL миграции
│       └── *.sql
├── roomi-pro-mobile/             # Мобильное приложение (React Native / Expo)
├── public/                       # Статические файлы
├── middleware.ts                 # Vercel Edge Middleware
├── vercel.json                   # Vercel конфигурация
├── vite.config.ts                # Vite конфигурация (app)
├── package.json
└── README.md
```

---

## 🔄 Интеграция с Avito

### Настройка

Подробная инструкция по настройке интеграции с Avito находится в файле [AVITO_SETUP.md](./AVITO_SETUP.md).

### Основные возможности

1. **OAuth авторизация**
   - Безопасное подключение аккаунта Avito через OAuth 2.0
   - Автоматическое сохранение токенов в зашифрованном виде

2. **Синхронизация календаря**
   - Автоматическая отправка доступности в Avito
   - Поддержка динамических цен
   - Закрытие дат при бронировании

3. **Импорт бронирований**
   - Автоматический импорт новых бронирований
   - Webhook для мгновенных уведомлений
   - Poller для надежности (резервный механизм)

4. **iCal экспорт**
   - Генерация iCal URL для каждого объекта
   - Импорт календаря в Avito

### Edge Functions

- `avito_sync` — синхронизация календаря и бронирований с Avito
- `avito-oauth-callback` — OAuth callback (в т.ч. messenger_auth: обновление scope, fallback по первой интеграции, 422 + `reason: no_avito_integration` при отсутствии интеграций)
- `avito-webhook` — webhook от Avito (бронирования)
- `avito-poller` — периодическая проверка новых бронирований
- `avito-close-availability` — закрытие доступности
- `avito-messenger` — прокси к Avito Messenger API (чаты, сообщения)
- `avito-messenger-webhook` — webhook для уведомлений мессенджера (при необходимости)

---

## Messenger Setup

- Для доступа к чатам при подключении Avito убедитесь, что в OAuth URL указан scope `messenger:read,messenger:write`.

---

## 🔌 API и Edge Functions

### Supabase Edge Functions

Все функции находятся в `supabase/functions/`:

- **avito_sync** — синхронизация календаря и бронирований с Avito
- **avito-oauth-callback** — OAuth callback (включая messenger_auth: расширение scope, fallback, 422 при отсутствии интеграций)
- **avito-webhook** — webhook уведомлений от Avito
- **avito-poller** — периодическая проверка новых бронирований (cron)
- **avito-close-availability** — закрытие доступности на Avito
- **avito-messenger** — прокси к Avito Messenger API (чаты, сообщения)
- **avito-messenger-webhook** — webhook мессенджера Avito
- **avito-message-poller** — серверный поллер сообщений (крон каждые 2 мин), вызывает `send-push` при новых непрочитанных
- **send-push** — Web Push уведомления (VAPID JWT + AES-GCM шифрование, RFC 8291)
- **ical** — генерация iCal для экспорта календаря
- **import-bookings** — импорт бронирований из Excel
- **log-booking-change** — запись истории изменений бронирований
- **delete-user-account** — полное удаление пользователя и данных (см. ниже)

- **apply-migration** — применение миграций БД
- **seed-test-data** — генерация тестовых данных

#### Удаление пользователя (delete-user-account)

Удаление выполняется через Edge Function `delete-user-account` в том же проекте Supabase, что и приложение. Два сценария:

1. **Самоудаление** — пользователь вызывает функцию с заголовком `Authorization: Bearer <jwt>` без тела; удаляется текущий пользователь.
2. **Удаление админом** — админ передаёт в теле запроса `{ "userId": "<uuid>" }` и заголовок с своим JWT; функция проверяет роль `admin` и удаляет указанного пользователя.

Порядок каскадного удаления: bookings → property_rates, integrations, avito_items, avito_sync_queue → properties → guests → chats (messages каскадом) → deletion_requests → profiles → auth.admin.deleteUser. Функцию необходимо задеплоить: `supabase functions deploy delete-user-account --project-ref <ваш-project-ref>`.

### API Endpoints

- `/functions/v1/ical/{propertyId}.ics` — iCal экспорт для объекта
- `/auth/avito-callback` — OAuth callback (основной и повторная авторизация для Messenger)
- `/functions/v1/avito-webhook` — webhook Avito (бронирования)

---

## 📊 База данных

### Основные таблицы

1. **profiles** — профили пользователей
2. **properties** — объекты недвижимости
3. **bookings** — бронирования
4. **property_rates** — динамические цены по дням недели
5. **integrations** — интеграции (Avito: OAuth токены, scope, в т.ч. messenger)
6. **chats**, **messages** — чаты и сообщения Avito Messenger
7. **push_subscriptions** — Web Push подписки (endpoint, p256dh, auth)
8. **avito_sync_queue** — очередь синхронизации Avito
9. **avito_logs** — логи операций с Avito

### Row Level Security (RLS)

Все таблицы защищены политиками RLS:
- Пользователи видят только свои данные
- Автоматическая проверка прав доступа
- Защита на уровне базы данных

### Миграции

Все миграции находятся в `supabase/migrations/` и применяются вручную через Supabase Dashboard (SQL Editor) или `supabase db push`. Для создания/редактирования бронирований и истории изменений должны быть применены миграции, добавляющие в `bookings` колонки `created_by`, `updated_by`, `deposit_*`, а также таблицу `booking_logs`. Edge Function `log-booking-change` должна быть задеплоена в тот же проект.

---

## 🎨 Особенности дизайна

### Диагональный эффект check-out

Уникальная визуальная особенность — бронирования "вытягиваются" диагонально на следующий день, показывая день выезда. Это помогает пользователям визуально отличать последний день проживания от дня выезда.

### Цветовая кодировка

Бронирования окрашены в зависимости от статуса:
- 🟦 **Синий** — подтверждено (confirmed)
- 🟨 **Жёлтый** — ожидание (pending)
- 🟥 **Красный** — отменено (cancelled)
- 🟩 **Зеленый** — завершено (completed)

### Темы

- ☀️ **Светлая тема** (по умолчанию)
- 🌙 **Тёмная тема**
- Определение системной темы

---

## 🔐 Безопасность

- ✅ Аутентификация через Supabase Auth
- ✅ Row Level Security на всех таблицах
- ✅ Защита от SQL инъекций
- ✅ Валидация данных на клиенте и сервере
- ✅ Безопасное хранение паролей (bcrypt через Supabase)
- ✅ Шифрование токенов через Supabase Vault
- ✅ HTTPS только
- ✅ CORS настройки

---

## 🧪 Разработка

### Запуск в режиме разработки

```bash
npm run dev
```

### Линтинг и проверка типов

```bash
# ESLint
npm run lint

# TypeScript проверка
npm run typecheck
```

### Тестирование

```bash
# Запуск тестов (watch)
npm test

# Однократный прогон (для CI)
npm run test:run
```

Тесты покрывают утилиты: `excelParser`, `dateParser`, `guestParser` и др.

### Структура коммитов

Используйте понятные сообщения коммитов:
- `feat:` — новая функциональность
- `fix:` — исправление бага
- `docs:` — изменения в документации
- `style:` — форматирование кода
- `refactor:` — рефакторинг
- `test:` — добавление тестов
- `chore:` — обновление зависимостей и т.д.

---

## 📝 Дополнительная документация

- [AVITO_SETUP.md](./AVITO_SETUP.md) — настройка интеграции с Avito
- [AVITO_POLLER_SETUP.md](./AVITO_POLLER_SETUP.md) — настройка poller
- [HOW_TO_VIEW_EDGE_FUNCTION_LOGS.md](./HOW_TO_VIEW_EDGE_FUNCTION_LOGS.md) — просмотр логов
- [TESTING.md](./TESTING.md) — руководство по тестированию
- [CHANGELOG.md](./CHANGELOG.md) — история изменений
- [docs/MIGRATION_ANTD_TO_SHADCN.md](./docs/MIGRATION_ANTD_TO_SHADCN.md) — миграция UI с Ant Design на shadcn/ui
- [docs/SECURITY_AUDIT_REPORT.md](./docs/SECURITY_AUDIT_REPORT.md) — отчёт по безопасности (RLS, Edge Functions, Vault, Zod)

---

## 🚧 Roadmap

### Сделано

- [x] **Онбординг**: выбор «Добавить объект вручную» или «Загрузить Excel», затем подключение площадок (Avito)
- [x] **Тариф Demo 5 дней**: единый план для free/basic/demo/trial, отображение в настройках (план, дата/время окончания демо, возможности)
- [x] Интеграция с Avito (OAuth, календарь, бронирования)
- [x] Чаты Avito Messenger (список чатов, сообщения, отправка, поиск в чате, мобильный адаптив)
- [x] Web Push уведомления (VAPID) — пуши о новых сообщениях при закрытом приложении
- [x] Серверный поллер сообщений (`avito-message-poller`, крон каждые 2 мин)
- [x] Быстрые ответы — редактируемые шаблоны (localStorage)
- [x] Управление аккаунтами — Avito + «Скоро» (Циан, Суточно, Airbnb, Booking)
- [x] Повторная OAuth для доступа к чатам (scope messenger:read/write), fallback по первой интеграции
- [x] Диалог «Нет подключённых аккаунтов Avito» и переход к объектам при 422
- [x] Миграция UI с Ant Design на **shadcn/ui + Radix UI** (кнопки, таблицы, модалки, формы, тосты)
- [x] **Zustand** для состояния (auth, theme, sync log)
- [x] Абсолютные импорты `@/` и `@components/` для удобной разработки
- [x] Юнит-тесты (Vitest) для парсеров и утилит; CI `test-and-build`
- [x] **Рефакторинг (аудит кода)**: устранены дубли `calculateNights`/`calculatePrice` в 4 файлах → общий `src/utils/bookingUtils.ts`; гонка useRef-флагов в формах заменена на `priceSource` state; логика загрузки данных вынесена в `src/hooks/useDashboardData.ts`; удалён мёртвый `ApiIntegrationSettings.tsx`; структурированная обработка ошибок Avito (statusCode вместо string matching); исправлен фильтр `deleted_at` в Dashboard

### В разработке / планируется

- [ ] Интеграция с CIAN API
- [ ] Синхронизация с другими площадками (Airbnb, Booking.com — по возможности API)
- [x] Push-уведомления о новых сообщениях (Web Push / PWA)
- [ ] Email/Telegram уведомления о новых бронированиях
- [ ] Мобильное приложение (React Native / Expo)
- [ ] Расширенная аналитика и экспорт отчётов
- [ ] Мультивалютность, платежи, публичный календарь для гостей

---

## 📄 Лицензия

Проект является приватным и не распространяется под открытой лицензией.

---

## 👥 Контакты

- **Website:** [roomi.pro](https://roomi.pro)
- **App:** [app.roomi.pro](https://app.roomi.pro)
- **GitHub:** [shinkarenko92-cyber/CM_bolt_1.0.1](https://github.com/shinkarenko92-cyber/CM_bolt_1.0.1)

---

**Сделано с ❤️ для индустрии краткосрочной аренды**
