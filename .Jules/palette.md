## 2025-05-14 - [Accessible Language Selector]
**Learning:** Custom hover-based menus are inaccessible to keyboard and screen reader users. Transitioning to a click-based dropdown using Radix UI (standard shadcn/ui) provides native accessibility support (ARIA roles, keyboard navigation, Esc to close).
**Action:** Use `DropdownMenu` from the design system instead of custom hover states for all navigation and selector components.
