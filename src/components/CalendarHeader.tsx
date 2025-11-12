import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { MiniCalendarPicker } from './MiniCalendarPicker';

type CalendarHeaderProps = {
  dates: Date[];
  currentDate: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onDateSelect: (date: Date) => void;
};

export function CalendarHeader({
  dates,
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

  const isToday = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate.getTime() === today.getTime();
  };

  return (
    <div className="sticky top-0 z-20 bg-slate-800 border-b border-slate-700">
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">
            {formatMonthYear(currentDate)}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onPrevMonth}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            title="Previous month"
          >
            <ChevronsLeft className="w-4 h-4 text-slate-400" />
          </button>
          <button
            onClick={onPrevWeek}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            title="Previous week"
          >
            <ChevronLeft className="w-4 h-4 text-slate-400" />
          </button>
          <button
            onClick={onToday}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Сегодня
          </button>
          <button
            onClick={onNextWeek}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            title="Next week"
          >
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
          <button
            onClick={onNextMonth}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            title="Next month"
          >
            <ChevronsRight className="w-4 h-4 text-slate-400" />
          </button>
          <div className="w-px h-6 bg-slate-700 mx-1" />
          <MiniCalendarPicker onDateSelect={onDateSelect} currentDate={currentDate} />
        </div>
      </div>

      <div className="flex">
        <div className="w-64 px-4 py-3 font-medium text-slate-300 text-sm border-r border-slate-700 flex-shrink-0">
          Объекты
        </div>
        <div className="flex overflow-x-auto">
          {dates.map((date, i) => {
            const today = isToday(date);

            return (
              <div
                key={i}
                className={`w-16 flex-shrink-0 border-r border-slate-700 ${
                  today ? 'bg-teal-500/10' : ''
                }`}
              >
                <div className="px-2 py-3 text-center">
                  <div className={`text-xs ${today ? 'text-teal-400' : 'text-slate-400'}`}>
                    {date.toLocaleDateString('ru-RU', { weekday: 'short' })}
                  </div>
                  <div className={`text-sm font-medium ${today ? 'text-teal-400' : 'text-slate-300'}`}>
                    {date.getDate()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
