import { create } from 'zustand';

export type WidgetId =
  | 'occupancy'
  | 'revenue'
  | 'today_activity'
  | 'pending'
  | 'adr'
  | 'bookings_count'
  | 'avg_stay';

export const ALL_WIDGET_IDS: WidgetId[] = [
  'occupancy',
  'revenue',
  'today_activity',
  'pending',
  'adr',
  'bookings_count',
  'avg_stay',
];

const DEFAULT_ENABLED: WidgetId[] = [
  'occupancy',
  'revenue',
  'today_activity',
  'pending',
];

const STORAGE_KEY = 'dashboard-widgets';

function loadFromStorage(): WidgetId[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as WidgetId[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_ENABLED;
}

function saveToStorage(widgets: WidgetId[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  } catch {
    // ignore
  }
}

interface WidgetStore {
  enabledWidgets: WidgetId[];
  toggleWidget: (id: WidgetId) => void;
}

export const useWidgetStore = create<WidgetStore>((set, get) => ({
  enabledWidgets: loadFromStorage(),

  toggleWidget: (id) => {
    const current = get().enabledWidgets;
    const next = current.includes(id)
      ? current.filter((w) => w !== id)
      : [...current, id];
    saveToStorage(next);
    set({ enabledWidgets: next });
  },
}));
