import { useEffect, useCallback, useState, useRef } from 'react';
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
import { Loader2 } from 'lucide-react';

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
  const [refreshing, setRefreshing] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const [pullIndicator, setPullIndicator] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      startYRef.current = e.touches[0].clientY;
    } else {
      startYRef.current = 0;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startYRef.current) return;
    const diff = e.touches[0].clientY - startYRef.current;
    pullDistanceRef.current = Math.max(0, diff);
    setPullIndicator(Math.min(pullDistanceRef.current / 80, 1));
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistanceRef.current > 80 && !refreshing) {
      setRefreshing(true);
      setPullIndicator(1);
      try {
        await fetchTasks();
      } finally {
        setRefreshing(false);
      }
    }
    pullDistanceRef.current = 0;
    startYRef.current = 0;
    setPullIndicator(0);
  }, [fetchTasks, refreshing]);

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
    <div
      ref={scrollRef}
      className="flex-1 flex flex-col overflow-auto p-4 pb-20"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {(pullIndicator > 0 || refreshing) && (
        <div
          className="flex items-center justify-center transition-all"
          style={{ height: refreshing ? 40 : pullIndicator * 40, opacity: refreshing ? 1 : pullIndicator }}
        >
          <Loader2 className={cn('h-5 w-5 text-primary', refreshing && 'animate-spin')} />
        </div>
      )}
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

  const swipeStartXRef = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const handleSwipeStart = (e: React.TouchEvent) => {
    swipeStartXRef.current = e.touches[0].clientX;
  };
  const handleSwipeMove = (e: React.TouchEvent) => {
    if (!swipeStartXRef.current) return;
    const diff = e.touches[0].clientX - swipeStartXRef.current;
    if (diff > 0 && (isPending || isInProgress)) {
      setSwipeOffset(Math.min(diff, 100));
    }
  };
  const handleSwipeEnd = () => {
    if (swipeOffset > 60) {
      if (isPending) onStatusChange(task.id, 'in_progress');
      else if (isInProgress) onStatusChange(task.id, 'done');
    }
    setSwipeOffset(0);
    swipeStartXRef.current = 0;
  };

  const swipeLabel = isPending
    ? t('cleaning.cleaner.start', { defaultValue: 'Начать' })
    : isInProgress
      ? t('cleaning.cleaner.finish', { defaultValue: 'Завершить' })
      : '';

  return (
    <div className="relative overflow-hidden rounded-xl">
      {(isPending || isInProgress) && (
        <div
          className={cn(
            'absolute inset-y-0 left-0 flex items-center pl-4 text-sm font-medium text-white',
            isPending ? 'bg-blue-500' : 'bg-green-500',
          )}
          style={{ width: swipeOffset }}
        >
          {swipeOffset > 40 && <span className="whitespace-nowrap">{swipeLabel}</span>}
        </div>
      )}
      <Card
        className="p-4 relative transition-transform"
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onTouchStart={handleSwipeStart}
        onTouchMove={handleSwipeMove}
        onTouchEnd={handleSwipeEnd}
      >
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
          <Button variant="ghost" className="h-11 px-4" onClick={onOpenDetail}>
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
              className="h-11 px-5"
              onClick={() => onStatusChange(task.id, 'in_progress')}
            >
              {t('cleaning.cleaner.start', { defaultValue: 'Начать' })}
            </Button>
          )}
          {isInProgress && (
            <Button
              className="h-11 px-5"
              variant="secondary"
              onClick={() => onStatusChange(task.id, 'done')}
            >
              {t('cleaning.cleaner.finish', { defaultValue: 'Завершить' })}
            </Button>
          )}
        </div>
      </div>
    </Card>
    </div>
  );
}
