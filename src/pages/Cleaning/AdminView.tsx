import { useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useCleaning } from '@/stores/cleaningStore';
import { WeeklyCalendar } from '@/pages/Cleaning/WeeklyCalendar';
import { CleanerProfiles } from '@/pages/Cleaning/CleanerProfiles';
import { TaskDrawer } from '@/pages/Cleaning/TaskDrawer';
import type { Property } from '@/lib/supabase';

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
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);

  useEffect(() => {
    void fetchTasks();
    void fetchCleaners();
  }, [fetchTasks, fetchCleaners]);

  const refresh = useCallback(() => {
    void fetchTasks();
  }, [fetchTasks]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t('cleaning.admin.title', { defaultValue: 'Уборка' })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('cleaning.admin.subtitle', { defaultValue: 'Планирование уборок и управление уборщицами' })}
          </p>
        </div>
      </div>

      <Tabs defaultValue="calendar" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full max-w-md justify-start mb-4 shrink-0">
          <TabsTrigger value="calendar">
            {t('cleaning.admin.tabCalendar', { defaultValue: 'Календарь' })}
          </TabsTrigger>
          <TabsTrigger value="cleaners">
            {t('cleaning.admin.tabCleaners', { defaultValue: 'Уборщицы' })}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="flex-1 flex flex-col min-h-0 mt-0">
          <WeeklyCalendar
            weekStart={selectedWeekStart}
            tasks={tasks}
            cleaners={cleaners}
            onPrevWeek={() => setSelectedWeekStart(new Date(selectedWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000))}
            onNextWeek={() => setSelectedWeekStart(new Date(selectedWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000))}
            onRefresh={refresh}
            onAddTask={() => setTaskDrawerOpen(true)}
          />
        </TabsContent>

        <TabsContent value="cleaners" className="flex-1 overflow-auto mt-0">
          <CleanerProfiles />
        </TabsContent>
      </Tabs>

      <TaskDrawer
        open={taskDrawerOpen}
        onOpenChange={setTaskDrawerOpen}
        properties={properties}
        cleaners={cleaners}
        defaultDate={selectedWeekStart.toISOString().slice(0, 10)}
        onSuccess={refresh}
      />
    </div>
  );
}
