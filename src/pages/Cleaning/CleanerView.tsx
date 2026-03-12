import { useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCleaning } from '@/stores/cleaningStore';
import { updateTaskStatus } from '@/services/cleaning';
import type { CleaningTask, CleaningStatus } from '@/types/cleaning';
import { TaskDetailSheet } from '@/pages/Cleaning/TaskDetailSheet';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function CleaningCleanerView() {
  const { t } = useTranslation();
  const { tasks, loading, fetchTasks, setSelectedWeekStart } = useCleaning();
  const [detailTask, setDetailTask] = useState<CleaningTask | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    setSelectedWeekStart(new Date());
    void fetchTasks();
  }, [fetchTasks, setSelectedWeekStart]);

  const todayStr = today();
  const tomorrowStr = tomorrow();
  const todayTasks = tasks.filter((x) => x.scheduled_date === todayStr);
  const tomorrowTasks = tasks.filter((x) => x.scheduled_date === tomorrowStr);
  const otherTasks = tasks.filter(
    (x) => x.scheduled_date !== todayStr && x.scheduled_date !== tomorrowStr
  );

  const handleStatus = useCallback(
    async (taskId: string, status: CleaningStatus) => {
      try {
        await updateTaskStatus(taskId, status);
        toast.success(
          status === 'in_progress'
            ? t('cleaning.cleaner.started', { defaultValue: 'Уборка начата' })
            : t('cleaning.cleaner.done', { defaultValue: 'Уборка завершена' })
        );
        void fetchTasks();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('common.loadError'));
      }
    },
    [fetchTasks, t]
  );

  return (
    <div className="flex-1 flex flex-col overflow-auto p-4">
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">
          {t('cleaning.cleaner.title', { defaultValue: 'Мои уборки' })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('cleaning.cleaner.subtitle', { defaultValue: 'Задачи на сегодня и завтра' })}
        </p>
      </header>

      <div className="flex gap-2 mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelectedWeekStart(new Date());
            void fetchTasks();
          }}
        >
          {t('cleaning.cleaner.today', { defaultValue: 'К текущей неделе' })}
        </Button>
      </div>

      {loading && tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="space-y-6">
          {todayTasks.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">
                {t('cleaning.cleaner.todayTasks', { defaultValue: 'Сегодня' })}
              </h2>
              <div className="space-y-3">
                {todayTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={handleStatus}
                    onOpenDetail={() => {
                      setDetailTask(task);
                      setDetailOpen(true);
                    }}
                  />
                ))}
              </div>
            </section>
          )}
          {tomorrowTasks.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">
                {t('cleaning.cleaner.tomorrowTasks', { defaultValue: 'Завтра' })}
              </h2>
              <div className="space-y-3">
                {tomorrowTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={handleStatus}
                    onOpenDetail={() => {
                      setDetailTask(task);
                      setDetailOpen(true);
                    }}
                  />
                ))}
              </div>
            </section>
          )}
          {otherTasks.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">
                {t('cleaning.cleaner.otherTasks', { defaultValue: 'Остальные' })}
              </h2>
              <div className="space-y-3">
                {otherTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={handleStatus}
                    onOpenDetail={() => {
                      setDetailTask(task);
                      setDetailOpen(true);
                    }}
                  />
                ))}
              </div>
            </section>
          )}
          <TaskDetailSheet
            task={detailTask}
            open={detailOpen}
            onOpenChange={setDetailOpen}
            onTaskUpdated={() => void fetchTasks()}
          />
          {tasks.length === 0 && !loading && (
            <Card className="p-6 text-center text-muted-foreground text-sm">
              {t('cleaning.cleaner.noTasks', { defaultValue: 'Нет запланированных уборок' })}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  onStatusChange,
  onOpenDetail,
}: {
  task: CleaningTask;
  onStatusChange: (taskId: string, status: CleaningStatus) => void;
  onOpenDetail: () => void;
}) {
  const { t } = useTranslation();
  const time = task.scheduled_time.slice(0, 5);
  const isPending = task.status === 'pending';
  const isInProgress = task.status === 'in_progress';
  const isDone = task.status === 'done';

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2">
        <p className="text-lg font-semibold leading-tight">
          {task.address || t('common.unknown')}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{task.scheduled_date}</span>
          <span>{time}</span>
          {task.door_code && (
            <span className="font-mono bg-muted px-2 py-0.5 rounded">
              {t('cleaning.cleaner.doorCode', { defaultValue: 'Код' })}: {task.door_code}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={onOpenDetail}>
            {t('cleaning.cleaner.details', { defaultValue: 'Подробнее' })}
          </Button>
          <Badge
            variant={isDone ? 'default' : 'secondary'}
            className={cn(
              isPending && 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
              isInProgress && 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
            )}
          >
            {task.status === 'pending' && t('bookings.pending')}
            {task.status === 'in_progress' && t('cleaning.cleaner.inProgress', { defaultValue: 'В работе' })}
            {task.status === 'done' && t('cleaning.cleaner.doneShort', { defaultValue: 'Готово' })}
            {task.status === 'cancelled' && t('cleaning.cleaner.cancelled', { defaultValue: 'Отменено' })}
          </Badge>
          {isPending && (
            <Button
              size="sm"
              onClick={() => onStatusChange(task.id, 'in_progress')}
            >
              {t('cleaning.cleaner.start', { defaultValue: 'Начать' })}
            </Button>
          )}
          {isInProgress && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onStatusChange(task.id, 'done')}
            >
              {t('cleaning.cleaner.finish', { defaultValue: 'Завершить' })}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
