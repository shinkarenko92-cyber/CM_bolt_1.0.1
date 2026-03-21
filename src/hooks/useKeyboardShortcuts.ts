import { useEffect } from 'react';

interface KeyboardShortcutsOptions {
  onNewBooking?: () => void;
  onFocusSearch?: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTypingInInput(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  return INPUT_TAGS.has(target.tagName) || target.isContentEditable;
}

/**
 * App-wide keyboard shortcuts.
 *   n / N  → new booking (skipped when typing in an input)
 *   /      → focus search input (skipped when already in an input)
 */
export function useKeyboardShortcuts({
  onNewBooking,
  onFocusSearch,
  searchInputRef,
}: KeyboardShortcutsOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip modifier combos (Ctrl/Cmd/Alt)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if ((e.key === 'n' || e.key === 'N') && !isTypingInInput(e)) {
        e.preventDefault();
        onNewBooking?.();
        return;
      }

      if (e.key === '/' && !isTypingInInput(e)) {
        e.preventDefault();
        if (searchInputRef?.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
        onFocusSearch?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewBooking, onFocusSearch, searchInputRef]);
}
