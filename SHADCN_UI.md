# shadcn/ui в Roomi Pro

## Установка (уже выполнена)

Компоненты shadcn/ui добавлены вручную в `src/components/ui/`. Используются зависимости, уже присутствующие в проекте:

- **Radix UI** — примитивы (Dialog, Select, Tabs, DropdownMenu, Tooltip, Avatar, Separator, ScrollArea, Label)
- **tailwindcss-animate** — анимации
- **class-variance-authority** (cva) — варианты кнопок/бейджей
- **clsx** + **tailwind-merge** — утилита `cn()` в `src/lib/utils.ts`

Алиас `@` → `src` настроен в `vite.config.ts` и `tsconfig.app.json`.

## Добавление новых компонентов shadcn

1. Открой [shadcn/ui](https://ui.shadcn.com/docs/components) и скопируй код нужного компонента.
2. Замени импорты `@/lib/utils` на существующий путь (уже настроен).
3. Сохрани файл в `src/components/ui/` (например, `textarea.tsx`).

Или через CLI (если позже подключишь):

```bash
npx shadcn@latest add button
```

Перед этим в проекте должен быть настроен `components.json` для shadcn (путь `src`, алиас `@`).

## Тема и переменные

Цвета заданы в `src/index.css` через CSS-переменные:

- **Тёмная тема (по умолчанию):** фон `#0f172a`, акцент teal `#14b8a6`
- **Светлая тема:** `data-theme="light"` на `<html>`

Переключение темы — в `ThemeContext` и кнопке в header (иконка солнца/луны).

## Где что переведено на shadcn

| Страница / блок        | Компоненты shadcn |
|------------------------|-------------------|
| Логин / регистрация    | Card, Input, Button, Label |
| Sidebar                | Button, Separator |
| Header (поиск, профиль)| Input, Avatar, DropdownMenu |
| Бронирования (список)  | Card, Badge, Input, Button, Select |
| Аналитика              | Card, Tabs, TabsList, TabsTrigger, Button, Input, Select |
| Модалки бронирования   | Пока без изменений (Ant Design); при необходимости заменить на Sheet + Tabs |

Модалки создания/редактирования брони (AddReservationModal, EditReservationModal) по-прежнему используют Ant Design (InputNumber, AutoComplete, Timeline). Их можно поэтапно перевести на Sheet справа + Tabs (Основное / Дополнительно / Платежи) и поля на shadcn Input/Select.
