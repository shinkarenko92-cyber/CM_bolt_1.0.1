import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { MiniCalendarPicker } from './MiniCalendarPicker';

type CalendarHeaderProps = {
  currentDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onDateSelect: (date: Date) => void;
};

export function CalendarHeader({
  currentDate,
  onPrevMonth,
  onNextMonth,
  onPrevWeek,
  onNextWeek,
  onToday,
  onDateSelect,
}: CalendarHeaderProps) {
  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="sticky top-0 z-20 bg-secondary border-b border-border backdrop-blur-md">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-foreground">
            {formatMonthYear(currentDate)}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onPrevMonth}
            className="p-2 hover:bg-accent rounded-lg transition-all duration-200 hover:scale-105 text-muted-foreground hover:text-foreground"
            title="Previous month"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onPrevWeek}
            className="p-2 hover:bg-accent rounded-lg transition-all duration-200 hover:scale-105 text-muted-foreground hover:text-foreground"
            title="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onToday}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95"
          >
            Сегодня
          </button>
          <button
            onClick={onNextWeek}
            className="p-2 hover:bg-accent rounded-lg transition-all duration-200 hover:scale-105 text-muted-foreground hover:text-foreground"
            title="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={onNextMonth}
            className="p-2 hover:bg-accent rounded-lg transition-all duration-200 hover:scale-105 text-muted-foreground hover:text-foreground"
            title="Next month"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-border mx-1" />
          <MiniCalendarPicker onDateSelect={onDateSelect} currentDate={currentDate} />
        </div>
      </div>
    </div>
  );
}
