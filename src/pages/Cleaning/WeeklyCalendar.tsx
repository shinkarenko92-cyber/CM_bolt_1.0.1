import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragEndEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { CleaningTask, Cleaner } from '@/types/cleaning';
import { updateTaskSchedule } from '@/services/cleaning';
import { cn } from '@/lib/utils';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 8); // 8:00 - 24:00
const DAYS = 7;

function slotId(dayIndex: number, hour: number): string {
  return `slot-${dayIndex}-${hour}`;
}

function parseSlotId(id: string): { dayIndex: number; hour: number } | null {
  const m = id.match(/^slot-(\d)-(\d+)$/);
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
  const d = task.scheduled_date;
  const [h] = task.scheduled_time.split(':').map(Number);
  const start = new Date(weekStart);
  const taskDate = new Date(d);
  const dayIndex = Math.round((taskDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (dayIndex < 0 || dayIndex >= DAYS) return '';
  return slotId(dayIndex, h);
}

function DroppableSlot({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn('min-h-[52px] p-1 border border-border/50 rounded', isOver && 'ring-2 ring-primary bg-primary/10', className)}
    >
      {children}
    </div>
  );
}

function DraggableTaskCard({
  task,
  cleaners,
}: {
  task: CleaningTask;
  cleaners: Cleaner[];
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  const cleaner = task.cleaner_id ? cleaners.find((c) => c.id === task.cleaner_id) : null;
  const color = cleaner?.color || '#6b7280';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'text-xs rounded px-2 py-1.5 cursor-grab active:cursor-grabbing truncate border-l-4 shadow-sm',
        isDragging && 'opacity-50'
      )}
      style={{ borderLeftColor: color }}
    >
      <div className="font-medium truncate">{task.address || task.id.slice(0, 8)}</div>
      <div className="text-muted-foreground truncate">{cleaner?.full_name ?? '—'}</div>
    </div>
  );
}

type WeeklyCalendarProps = {
  weekStart: Date;
  tasks: CleaningTask[];
  cleaners: Cleaner[];
  onRefresh: () => void;
};

export function WeeklyCalendar({
  weekStart,
  tasks,
  cleaners,
  onRefresh,
}: WeeklyCalendarProps) {
  const { t } = useTranslation();
  const weekDays = getWeekDays(weekStart);

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
        console.error('Failed to move task', e);
      }
    },
    [weekStart, tasks, onRefresh]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
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

  return (
    <div className="flex flex-col gap-4">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="border rounded-lg overflow-auto max-h-[60vh]">
          <table className="w-full border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-14 p-2 text-left text-xs font-medium text-muted-foreground">
                  {t('cleaning.admin.time', { defaultValue: 'Время' })}
                </th>
                {weekDays.map((d, i) => (
                  <th key={i} className="p-2 text-center text-xs font-medium min-w-[120px]">
                    {d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((hour) => (
                <tr key={hour} className="border-b">
                  <td className="p-2 text-xs text-muted-foreground align-top whitespace-nowrap">
                    {hour === 24 ? '24:00' : `${String(hour).padStart(2, '0')}:00`}
                  </td>
                  {weekDays.map((_, dayIndex) => {
                    const id = slotId(dayIndex, hour);
                    const slotTasks = tasksBySlot.get(id) ?? [];
                    return (
                      <td key={id} className="p-1 align-top">
                        <DroppableSlot id={id}>
                          {slotTasks.map((task) => (
                            <DraggableTaskCard
                              key={task.id}
                              task={task}
                              cleaners={cleaners}
                            />
                          ))}
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
    </div>
  );
}
