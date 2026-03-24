## 2025-05-22 - [LanguageSelector Accessibility and Consistency]
**Learning:** Replacing custom hover-based menus with click-based `DropdownMenu` from shadcn/ui significantly improves accessibility and mobile usability while maintaining a polished feel. Custom hover logic is often prone to accessibility issues and behaves poorly on touch devices.
**Action:** Always prefer standard `DropdownMenu` (click-based) over custom hover-based implementations to ensure full keyboard accessibility and reliable mobile behavior. Ensure icon-only buttons have descriptive `aria-label` attributes.
