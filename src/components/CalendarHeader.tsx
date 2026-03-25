import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { MiniCalendarPicker } from '@/components/MiniCalendarPicker';

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
      <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-3 border-b border-border">
        <div className="flex items-center gap-2 sm:gap-4">
          <h2 className="text-sm sm:text-lg font-semibold text-foreground">
            {formatMonthYear(currentDate)}
          </h2>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={onPrevMonth}
            className="hidden sm:flex items-center justify-center min-h-[44px] min-w-[44px] p-2 hover:bg-accent rounded-lg transition-all duration-200 hover:scale-105 text-muted-foreground hover:text-foreground"
            aria-label="Предыдущий месяц"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onPrevWeek}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 hover:bg-accent rounded-lg transition-all duration-200 hover:scale-105 text-muted-foreground hover:text-foreground"
            aria-label="Предыдущая неделя"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onToday}
            className="px-2 sm:px-4 min-h-[44px] bg-brand hover:opacity-90 text-brand-foreground rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 hover:scale-105 active:scale-95"
          >
            Сегодня
          </button>
          <button
            onClick={onNextWeek}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 hover:bg-accent rounded-lg transition-all duration-200 hover:scale-105 text-muted-foreground hover:text-foreground"
            aria-label="Следующая неделя"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={onNextMonth}
            className="hidden sm:flex items-center justify-center min-h-[44px] min-w-[44px] p-2 hover:bg-accent rounded-lg transition-all duration-200 hover:scale-105 text-muted-foreground hover:text-foreground"
            aria-label="Следующий месяц"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-border mx-0.5 sm:mx-1" />
          <MiniCalendarPicker onDateSelect={onDateSelect} currentDate={currentDate} />
        </div>
      </div>
    </div>
  );
}
