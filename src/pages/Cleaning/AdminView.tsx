import { useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useCleaning } from '@/stores/cleaningStore';
import { WeeklyCalendar } from '@/pages/Cleaning/WeeklyCalendar';
import { CleanerProfiles } from '@/pages/Cleaning/CleanerProfiles';
import { TaskDrawer } from '@/pages/Cleaning/TaskDrawer';
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
  const [tabValue, setTabValue] = useState('calendar');
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

      <Tabs value={tabValue} onValueChange={setTabValue} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit mb-4 shrink-0">
          <TabsTrigger value="calendar">
            {t('cleaning.admin.tabCalendar', { defaultValue: 'Календарь' })}
          </TabsTrigger>
          <TabsTrigger value="cleaners">
            {t('cleaning.admin.tabCleaners', { defaultValue: 'Уборщицы' })}
          </TabsTrigger>
        </TabsList>

        {/* Общая строка: слева — навигация недели или подсказка, справа — кнопка (одно и то же место) */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4 shrink-0">
          {tabValue === 'calendar' && (
            <>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSelectedWeekStart(new Date(selectedWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000))}
                  aria-label={t('calendar.prevWeek')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[180px] text-center">
                  {selectedWeekStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} —{' '}
                  {weekEnd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSelectedWeekStart(new Date(selectedWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000))}
                  aria-label={t('calendar.nextWeek')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button size="sm" onClick={() => setTaskDrawerOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                {t('cleaning.admin.addTask', { defaultValue: 'Добавить уборку' })}
              </Button>
            </>
          )}
          {tabValue === 'cleaners' && (
            <>
              <div className="flex items-center gap-2 min-w-[180px]">
                {cleaners.length === 0 && (
                  <>
                    <span className="text-sm text-muted-foreground">
                      {t('cleaning.admin.addCleanerFirst', { defaultValue: 'Для начала добавьте уборщицу' })}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                  </>
                )}
              </div>
              <Button size="sm" onClick={() => setAddCleanerDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                {t('cleaning.admin.addCleaner', { defaultValue: 'Добавить уборщицу' })}
              </Button>
            </>
          )}
        </div>

        <TabsContent value="calendar" className="flex-1 flex flex-col min-h-0 mt-0">
          <WeeklyCalendar
            weekStart={selectedWeekStart}
            tasks={tasks}
            cleaners={cleaners}
            onRefresh={refresh}
          />
        </TabsContent>

        <TabsContent value="cleaners" className="flex-1 flex flex-col min-h-0 mt-0 overflow-hidden">
          <CleanerProfiles
            addDialogOpen={addCleanerDialogOpen}
            onAddDialogOpenChange={setAddCleanerDialogOpen}
          />
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
