import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragEndEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { CleaningTask, Cleaner, CleaningStatus } from '@/types/cleaning';
import { updateTaskSchedule } from '@/services/cleaning';
import { cn } from '@/lib/utils';
import { MapPin, Clock, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 8);
const DAYS = 7;

const STATUS_DOT: Record<CleaningStatus, string> = {
  pending: 'bg-yellow-400',
  in_progress: 'bg-blue-500',
  done: 'bg-green-500',
  cancelled: 'bg-gray-400',
};

function slotId(dayIndex: number, hour: number): string {
  return `slot-${dayIndex}-${hour}`;
}

function parseSlotId(id: string): { dayIndex: number; hour: number } | null {
  const m = id.match(/^slot-(\d+)-(\d+)$/);
  if (!m) return null;
  return { dayIndex: parseInt(m[1], 10), hour: parseInt(m[2], 10) };
}

function getWeekDays(weekStart: Date): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    out.push(d);
  }
  return out;
}

function taskToSlotKey(task: CleaningTask, weekStart: Date): string {
  const [h] = task.scheduled_time.split(':').map(Number);
  const start = new Date(weekStart);
  const taskDate = new Date(task.scheduled_date);
  const dayIndex = Math.round((taskDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (dayIndex < 0 || dayIndex >= DAYS) return '';
  return slotId(dayIndex, h);
}

function DroppableSlot({
  id,
  children,
  isToday,
}: {
  id: string;
  children: React.ReactNode;
  isToday?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[48px] p-0.5 rounded-sm transition-colors',
        isToday ? 'bg-primary/[0.03]' : 'bg-transparent',
        isOver && 'ring-2 ring-primary/40 bg-primary/10',
      )}
    >
      {children}
    </div>
  );
}

function DraggableTaskCard({
  task,
  cleaners,
  onOpenDetail,
}: {
  task: CleaningTask;
  cleaners: Cleaner[];
  onOpenDetail?: (task: CleaningTask) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const cleaner = task.cleaner_id ? cleaners.find((c) => c.id === task.cleaner_id) : null;
  const color = cleaner?.color || '#94a3b8';
  const time = task.scheduled_time.slice(0, 5);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex text-[11px] leading-tight rounded-md overflow-hidden',
        'bg-white dark:bg-card border shadow-sm hover:shadow transition-shadow',
        isDragging && 'opacity-40 shadow-lg',
      )}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        className={cn(
          'shrink-0 px-1 py-1.5 cursor-grab active:cursor-grabbing touch-none',
          'text-muted-foreground hover:bg-muted/60 border-r border-border/40',
        )}
        title={t('cleaning.admin.dragToMove', { defaultValue: 'Перенести' })}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={cn(
          'flex-1 min-w-0 text-left px-2 py-1.5 cursor-pointer',
          'hover:bg-muted/40 transition-colors',
        )}
        onClick={() => onOpenDetail?.(task)}
      >
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            <span>{time}</span>
          </div>
          <span
            className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[task.status])}
            title={task.status}
          />
        </div>
        {task.address && (
          <div className="flex items-start gap-1">
            <MapPin className="h-2.5 w-2.5 mt-0.5 shrink-0 text-muted-foreground" />
            <span className="font-medium truncate">{task.address}</span>
          </div>
        )}
        <div className="text-muted-foreground truncate mt-0.5" style={{ color }}>
          {cleaner?.full_name ?? '—'}
        </div>
      </button>
    </div>
  );
}

type WeeklyCalendarProps = {
  weekStart: Date;
  tasks: CleaningTask[];
  cleaners: Cleaner[];
  onRefresh: () => void;
  onTaskClick?: (task: CleaningTask) => void;
};

export function WeeklyCalendar({
  weekStart,
  tasks,
  cleaners,
  onRefresh,
  onTaskClick,
}: WeeklyCalendarProps) {
  const { t, i18n } = useTranslation();
  const weekDays = getWeekDays(weekStart);
  const todayStr = new Date().toISOString().slice(0, 10);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const slot = parseSlotId(over.id as string);
      if (!slot || active.id === over.id) return;
      const task = tasks.find((x) => x.id === active.id);
      if (!task) return;

      const targetDate = new Date(weekStart);
      targetDate.setDate(weekStart.getDate() + slot.dayIndex);
      const dateStr = targetDate.toISOString().slice(0, 10);
      const timeStr = `${String(slot.hour).padStart(2, '0')}:00:00`;

      try {
        await updateTaskSchedule(task.id, dateStr, timeStr);
        onRefresh();
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : t('cleaning.admin.dragScheduleError', { defaultValue: 'Не удалось перенести уборку' }),
        );
      }
    },
    [weekStart, tasks, onRefresh, t],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const tasksBySlot = new Map<string, CleaningTask[]>();
  for (const task of tasks) {
    const key = taskToSlotKey(task, weekStart);
    if (key) {
      const list = tasksBySlot.get(key) ?? [];
      list.push(task);
      tasksBySlot.set(key, list);
    }
  }

  const locale = i18n.language || 'ru-RU';

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="border rounded-lg overflow-auto max-h-[calc(100vh-280px)] bg-card">
        <table className="w-full border-collapse min-w-[720px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/80 backdrop-blur-sm border-b">
              <th className="w-[60px] p-2 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {t('cleaning.admin.time', { defaultValue: 'Время' })}
              </th>
              {weekDays.map((d, i) => {
                const isToday = d.toISOString().slice(0, 10) === todayStr;
                const dayNum = d.getDate();
                return (
                  <th
                    key={i}
                    className={cn(
                      'p-2 text-center min-w-[110px] transition-colors',
                      isToday ? 'bg-primary/10' : '',
                    )}
                  >
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                      {d.toLocaleDateString(locale, { weekday: 'short' })}
                    </div>
                    <div
                      className={cn(
                        'text-sm font-semibold mt-0.5',
                        isToday
                          ? 'bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center mx-auto'
                          : 'text-foreground',
                      )}
                    >
                      {dayNum}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {HOURS.map((hour, idx) => (
              <tr
                key={hour}
                className={cn(
                  'border-b border-border/40',
                  idx % 2 === 0 ? '' : 'bg-muted/20',
                )}
              >
                <td className="px-2 py-1 text-[11px] text-muted-foreground align-top whitespace-nowrap tabular-nums">
                  {hour === 24 ? '24:00' : `${String(hour).padStart(2, '0')}:00`}
                </td>
                {weekDays.map((d, dayIndex) => {
                  const id = slotId(dayIndex, hour);
                  const slotTasks = tasksBySlot.get(id) ?? [];
                  const isTodayCol = d.toISOString().slice(0, 10) === todayStr;
                  return (
                    <td
                      key={id}
                      className={cn(
                        'p-0.5 align-top border-l border-border/30',
                        isTodayCol && 'bg-primary/[0.04]',
                      )}
                    >
                      <DroppableSlot id={id} isToday={isTodayCol}>
                        <div className="space-y-1">
                          {slotTasks.map((task) => (
                            <DraggableTaskCard
                              key={task.id}
                              task={task}
                              cleaners={cleaners}
                              onOpenDetail={onTaskClick}
                            />
                          ))}
                        </div>
                      </DroppableSlot>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DndContext>
  );
}
