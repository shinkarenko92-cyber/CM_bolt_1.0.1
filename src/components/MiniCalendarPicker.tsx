import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface MiniCalendarPickerProps {
  onDateSelect: (date: Date) => void;
  currentDate: Date;
}

export function MiniCalendarPicker({ onDateSelect, currentDate }: MiniCalendarPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date(currentDate));
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.right - 288, // 288 = width of dropdown (w-72 = 18rem = 288px)
      });
    }
  }, [isOpen]);

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return firstDay === 0 ? 6 : firstDay - 1;
  };

  const goToPrevMonth = () => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setViewDate(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setViewDate(newDate);
  };

  const handleDateClick = (day: number) => {
    const selectedDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    onDateSelect(selectedDate);
    setIsOpen(false);
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(viewDate);
    const firstDay = getFirstDayOfMonth(viewDate);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-8" />);
    }

    const todayDate = new Date();
    const today = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());

    for (let day = 1; day <= daysInMonth; day++) {
      const dateToCheck = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
      const isToday = dateToCheck.getTime() === today.getTime();
      const isSelected =
        dateToCheck.getFullYear() === currentDate.getFullYear() &&
        dateToCheck.getMonth() === currentDate.getMonth() &&
        dateToCheck.getDate() === currentDate.getDate();

      days.push(
        <button
          key={day}
          onClick={() => handleDateClick(day)}
          className={`h-8 flex items-center justify-center rounded hover:bg-slate-700 transition-colors text-sm ${
            isToday && !isSelected ? 'bg-teal-500/20 text-teal-400 font-semibold' : ''
          } ${isSelected ? 'bg-teal-600 text-white' : 'text-slate-300'}`}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      className="fixed bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-4 w-72"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        zIndex: 9999,
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={goToPrevMonth}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </button>
        <div className="text-white font-semibold">
          {viewDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
        </div>
        <button
          onClick={goToNextMonth}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
          <div key={day} className="h-8 flex items-center justify-center text-xs text-slate-500 font-medium">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {renderCalendar()}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
        title="Выбрать дату"
      >
        <Calendar className="w-4 h-4 text-slate-400" />
      </button>
      {createPortal(dropdown, document.body)}
    </>
  );
}
