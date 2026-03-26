import { useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCleaning } from '@/stores/cleaningStore';
import { WeeklyCalendar } from '@/pages/Cleaning/WeeklyCalendar';
import { CleanerProfiles } from '@/pages/Cleaning/CleanerProfiles';
import { TaskDrawer } from '@/pages/Cleaning/TaskDrawer';
import { cn } from '@/lib/utils';
import type { Property } from '@/lib/supabase';

const WEEK_DAYS = 7;

type CleaningAdminViewProps = {
  properties: Property[];
};

export function CleaningAdminView({ properties }: CleaningAdminViewProps) {
  const { t } = useTranslation();
  const {
    tasks,
    cleaners,
    selectedWeekStart,
    setSelectedWeekStart,
    fetchTasks,
    fetchCleaners,
  } = useCleaning();
  const [tabValue, setTabValue] = useState<'calendar' | 'cleaners'>('calendar');
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [addCleanerDialogOpen, setAddCleanerDialogOpen] = useState(false);

  useEffect(() => {
    void fetchTasks();
    void fetchCleaners();
  }, [fetchTasks, fetchCleaners]);

  const refresh = useCallback(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const weekEnd = new Date(selectedWeekStart);
  weekEnd.setDate(weekEnd.getDate() + WEEK_DAYS - 1);

  return (
    <div className="flex-1 flex flex-col overflow-auto p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {t('cleaning.admin.title', { defaultValue: 'Уборка' })}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('cleaning.admin.subtitle', { defaultValue: 'Планирование уборок и управление уборщицами' })}
        </p>
      </div>

      {/* Tab bar + action row */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setTabValue('calendar')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tabValue === 'calendar'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <CalendarDays className="h-4 w-4" />
            {t('cleaning.admin.tabCalendar', { defaultValue: 'Календарь' })}
          </button>
          <button
            type="button"
            onClick={() => setTabValue('cleaners')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tabValue === 'cleaners'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Users className="h-4 w-4" />
            {t('cleaning.admin.tabCleaners', { defaultValue: 'Уборщицы' })}
            {cleaners.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/10 text-primary text-xs font-semibold px-1.5 py-0.5 leading-none">
                {cleaners.length}
              </span>
            )}
          </button>
        </div>

        {tabValue === 'calendar' && (
          <Button onClick={() => setTaskDrawerOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            {t('cleaning.admin.addTask', { defaultValue: 'Добавить уборку' })}
          </Button>
        )}
        {tabValue === 'cleaners' && (
          <Button onClick={() => setAddCleanerDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            {t('cleaning.admin.addCleaner', { defaultValue: 'Добавить уборщицу' })}
          </Button>
        )}
      </div>

      {/* Calendar controls */}
      {tabValue === 'calendar' && (
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSelectedWeekStart(new Date(selectedWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums">
            {selectedWeekStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} —{' '}
            {weekEnd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSelectedWeekStart(new Date(selectedWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setSelectedWeekStart(new Date())}
          >
            {t('cleaning.admin.today', { defaultValue: 'Сегодня' })}
          </Button>
        </div>
      )}

      {/* Content */}
      {tabValue === 'calendar' && (
        <WeeklyCalendar
          weekStart={selectedWeekStart}
          tasks={tasks}
          cleaners={cleaners}
          onRefresh={refresh}
        />
      )}

      {tabValue === 'cleaners' && (
        <CleanerProfiles
          addDialogOpen={addCleanerDialogOpen}
          onAddDialogOpenChange={setAddCleanerDialogOpen}
        />
      )}

      <TaskDrawer
        open={taskDrawerOpen}
        onOpenChange={setTaskDrawerOpen}
        properties={properties}
        cleaners={cleaners}
        defaultDate={new Date().toISOString().slice(0, 10)}
        onSuccess={refresh}
      />
    </div>
  );
}
