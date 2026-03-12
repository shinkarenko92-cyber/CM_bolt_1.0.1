import { create } from 'zustand';
import type {
  Cleaner,
  CleaningTask,
} from '@/types/cleaning';
import { getTasks, getCleaners } from '@/services/cleaning';

interface CleaningState {
  tasks: CleaningTask[];
  cleaners: Cleaner[];
  selectedWeekStart: Date;
  selectedTaskId: string | null;
  loading: boolean;
  cleanersLoading: boolean;
  error: string | null;
}

interface CleaningActions {
  setSelectedWeekStart: (date: Date) => void;
  setSelectedTaskId: (id: string | null) => void;
  fetchTasks: () => Promise<void>;
  fetchCleaners: () => Promise<void>;
}

type CleaningStore = CleaningState & CleaningActions;

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 (Sun) - 6 (Sat)
  const diff = (day + 6) % 7; // Monday as start of week
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d;
}

export const useCleaningStore = create<CleaningStore>((set, get) => ({
  tasks: [],
  cleaners: [],
  selectedWeekStart: getWeekStart(new Date()),
  selectedTaskId: null,
  loading: false,
  cleanersLoading: false,
  error: null,

  setSelectedWeekStart: (date: Date) => {
    set({ selectedWeekStart: getWeekStart(date) });
  },

  setSelectedTaskId: (id: string | null) => {
    set({ selectedTaskId: id });
  },

  fetchTasks: async () => {
    const { selectedWeekStart } = get();
    set({ loading: true, error: null });
    try {
      const tasks = await getTasks(selectedWeekStart);
      set({ tasks, loading: false });
    } catch (error) {
      console.error('Failed to load cleaning tasks', error);
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load cleaning tasks',
      });
    }
  },

  fetchCleaners: async () => {
    set({ cleanersLoading: true });
    try {
      const cleaners = await getCleaners();
      set({ cleaners, cleanersLoading: false });
    } catch (error) {
      console.error('Failed to load cleaners', error);
      set({
        cleanersLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load cleaners',
      });
    }
  },
}));

export function useCleaning() {
  return useCleaningStore();
}

