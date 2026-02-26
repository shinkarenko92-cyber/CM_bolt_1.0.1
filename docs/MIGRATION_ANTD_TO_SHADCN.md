# План миграции Ant Design → shadcn/ui + Radix

## 1. Сводка импортов из `antd` по файлам

| Файл | Импорты из antd |
|------|-----------------|
| `src/main.tsx` | `antd/dist/reset.css` (глобальные стили) |
| `src/pages/OnboardingImport.tsx` | Upload, Table, Button, Progress, Alert + типы UploadFile, UploadProps |
| `src/components/DeletePropertyModal.tsx` | Modal, Table, Button |
| `src/components/GuestModal.tsx` | Modal, Input, Button, Tag, Space, Divider, List |
| `src/components/SignupForm.tsx` | message, Modal |
| `src/services/avitoErrors.tsx` | Modal |
| `src/components/ImportBookingsModal.tsx` | Upload, Table, Button, Progress, Alert + типы |
| `src/components/GuestsView.tsx` | Table, Tag, Button, Input |
| `src/components/ChatPanel.tsx` | Input, Button, Dropdown, Upload, message, Badge, Spin |
| `src/components/AvitoConnectModal.tsx` | Modal, Steps, Button, Input, InputNumber, Spin, Select |
| `src/components/AvitoErrorModal.tsx` | Modal |
| `src/components/PropertyModal.tsx` | Button, Input, InputNumber, Modal, Select, Tabs |
| `src/components/BookingLogsTable.tsx` | Table, Tag, Tooltip, Button + ColumnsType |

**Уникальные компоненты AntD:** Modal, Table, Button, Upload, Progress, Alert, Input, Tag, Space, Divider, List, message, Dropdown, Badge, Spin, Steps, InputNumber, Select, Tabs, Tooltip, ColumnsType (тип).

---

## 2. Маппинг AntD → shadcn/ui (или кастом)

| AntD | shadcn/ui эквивалент | Примечание |
|------|----------------------|------------|
| **Button** | `@/components/ui/button` | variant: primary→default, danger→destructive, default→outline/ghost |
| **Modal** | `@/components/ui/dialog` (Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter) | open/onCancel → controlled через Dialog open + onOpenChange |
| **Table** | `@/components/ui/table` (примитивы) + обёртка под dataSource/columns | Кастомная обёртка или рендер по columns |
| **Form** | react-hook-form + zod + `Label`, `Input`, `Button` из ui | В проекте Form из antd не используется, на будущее |
| **Input** | `@/components/ui/input` | |
| **Input.TextArea** | `@/components/ui/textarea` | |
| **InputNumber** | `Input type="number"` или кастом с min/max/step | |
| **Select** | `@/components/ui/select` | |
| **Tag** | `@/components/ui/badge` | color → variant (success, destructive, outline) |
| **Space** | `div` с `className="flex gap-2"` | |
| **Space.Compact** | `div` с `className="flex gap-0"` + стили для склейки | |
| **Divider** | `@/components/ui/separator` | |
| **List** | `ul` / `ScrollArea` + map | |
| **message** | `react-hot-toast` (toast.success/error) | Уже используется в проекте |
| **Dropdown** | `@/components/ui/dropdown-menu` | |
| **Badge** | `@/components/ui/badge` | |
| **Tooltip** | `@/components/ui/tooltip` | title → TooltipContent children |
| **Tabs** | `@/components/ui/tabs` | |
| **Progress** | `@/components/ui/progress` | |
| **Alert** | Кастом на базе div + иконка или добавить Alert из shadcn | |
| **Spin** | Кастом: `Loader2` из lucide-react + animate-spin | |
| **Steps** | Кастом: нумерованные div + состояние active | |
| **Upload** | Кастом: input file + drag-drop (или react-dropzone) | |

---

## 3. Этапы миграции (по одному компоненту)

1. **AvitoErrorModal** — только Modal + кнопки → Dialog + Button  
2. **AvitoErrorModal (avitoErrors.tsx)** — если там рендер Modal  
3. **DeletePropertyModal** — Modal + Table + Button  
4. **SignupForm** — message + Modal → toast + Dialog  
5. **GuestModal** — Modal, Input, Button, Tag, Space, Divider, List  
6. **PropertyModal** — Button, Input, InputNumber, Modal, Select, Tabs  
7. **AvitoConnectModal** — Modal, Steps, Button, Input, InputNumber, Spin, Select  
8. **GuestsView** — Table, Tag, Button, Input  
9. **BookingLogsTable** — Table, Tag, Tooltip, Button  
10. **ChatPanel** — Input, Button, Dropdown, Upload, message, Badge, Spin  
11. **ImportBookingsModal** — Upload, Table, Button, Progress, Alert  
12. **OnboardingImport** — Upload, Table, Button, Progress, Alert  

После миграции всех файлов: удалить `antd` из dependencies, убрать `import 'antd/dist/reset.css'` из `main.tsx`.

---

## 4. Соответствие props (кратко)

- **Modal**: `open` → `<Dialog open={open} onOpenChange={(v) => !v && onClose()}>`, `onCancel` → `onOpenChange`, `title` → `DialogTitle`, `footer` → `DialogFooter`, `width` → `DialogContent className="max-w-[...px]"`, `maskClosable` → не кликать overlay при false (по умолчанию в Radix можно закрывать).
- **Button**: `type="primary"` → `variant="default"`, `type="danger"` / `danger` → `variant="destructive"`, `loading` → иконка Loader2 + `disabled`, `icon` → children с иконкой слева.
- **Table**: columns с `title`, `dataIndex`, `render` → маппинг в `<TableHead>`, `<TableCell>` с вызовом render для ячеек; `dataSource` → map в `<TableRow>`; `pagination` → кастомный пагинатор внизу; `loading` → overlay со спиннером.
- **Form**: не используется; при появлении — react-hook-form + ui Input/Label/Button.

---

## 5. Примеры кода замен

### Button (AntD → shadcn)
```tsx
// Было
<Button type="primary" loading={loading}>Сохранить</Button>
<Button type="default" danger onClick={...}>Отмена</Button>

// Стало
<Button disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Сохранить</Button>
<Button variant="destructive" onClick={...}>Отмена</Button>
```

### Modal → Dialog
```tsx
// Было
<Modal open={isOpen} onCancel={onClose} title="Заголовок" footer={...} width={600}>
  {children}
</Modal>

// Стало
<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
  <DialogContent className="max-w-[600px]">
    <DialogHeader><DialogTitle>Заголовок</DialogTitle></DialogHeader>
    {children}
    <DialogFooter>{footerButtons}</DialogFooter>
  </DialogContent>
</Dialog>
```

### Table (AntD columns/dataSource → shadcn Table)
Рендер по columns: для каждой колонки — `TableHead`, для каждой строки dataSource — `TableRow` с `TableCell`, вызывая column.render(value, record) где есть.

---

## 6. tailwind.config.js

Текущий конфиг уже содержит `primary`, `destructive`, `border`, `background` и т.д. Дополнительные токены для AntD не требуются. При необходимости добавить только утилиты для таблицы (например, `table-fixed`).
