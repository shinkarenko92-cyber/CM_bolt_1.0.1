import { useState } from 'react';
import { Booking } from '../lib/supabase';

type BookingBlockProps = {
  booking: Booking;
  startCol: number;
  span: number;
  layerIndex: number;
  cellWidth: number;
  onClick: () => void;
  onDragStart: (booking: Booking) => void;
  onDragEnd: () => void;
  isDragging: boolean;
};

const SOURCE_COLORS = {
  avito: { bg: '#4CAF50', text: 'text-white', badge: 'A' },
  cian: { bg: '#2196F3', text: 'text-white', badge: 'C' },
  booking: { bg: '#F44336', text: 'text-white', badge: 'B' },
  airbnb: { bg: '#FF5A5F', text: 'text-white', badge: 'Ab' },
  manual: { bg: '#64748b', text: 'text-white', badge: 'M' },
};

export function BookingBlock({
  booking,
  startCol,
  span,
  layerIndex,
  cellWidth,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
}: BookingBlockProps) {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const source = booking.source.toLowerCase() as keyof typeof SOURCE_COLORS;
  const colorConfig = SOURCE_COLORS[source] || SOURCE_COLORS.manual;

  const topOffset = 8 + layerIndex * 60;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      onDragStart(booking);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setTimeout(() => {
      if (touchStart) {
        onDragStart(booking);
      }
    }, 200);
  };

  const handleTouchEnd = () => {
    setTouchStart(null);
    onDragEnd();
  };

  return (
    <div
      onClick={onClick}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`absolute rounded px-2 py-1 ${colorConfig.text} text-xs font-medium cursor-grab active:cursor-grabbing transition-all hover:shadow-lg hover:z-10 group ${
        isDragging ? 'opacity-50 cursor-grabbing' : ''
      }`}
      style={{
        left: `${startCol * cellWidth}px`,
        width: `${span * cellWidth}px`,
        top: `${topOffset}px`,
        height: '44px',
        backgroundColor: colorConfig.bg,
        clipPath: span > 1
          ? 'polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%)'
          : 'none',
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="truncate font-semibold">{booking.guest_name}</div>
          <div className="text-[10px] opacity-90 truncate">
            {booking.total_price} {booking.currency}
          </div>
        </div>
        <div
          className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold border border-white/30`}
          style={{ backgroundColor: colorConfig.bg, opacity: 0.8 }}
        >
          {colorConfig.badge}
        </div>
      </div>

      {span > 1 && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            right: 0,
            width: '32px',
            background: `linear-gradient(135deg, transparent 0%, transparent calc(50% - 1px), rgba(0,0,0,0.3) calc(50%), transparent calc(50% + 1px), transparent 100%)`,
          }}
        />
      )}

      <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-3 min-w-[250px]">
        <div className="text-white font-semibold mb-2 text-sm">
          {booking.guest_name}
        </div>
        <div className="text-slate-300 text-xs space-y-1">
          <div>
            <span className="text-slate-400">Заезд:</span>{' '}
            {formatDate(booking.check_in)}
          </div>
          <div>
            <span className="text-slate-400">Выезд:</span>{' '}
            {formatDate(booking.check_out)}
          </div>
          <div>
            <span className="text-slate-400">Цена:</span>{' '}
            {booking.total_price} {booking.currency}
          </div>
          {booking.guest_phone && (
            <div>
              <span className="text-slate-400">Телефон:</span>{' '}
              {booking.guest_phone}
            </div>
          )}
          {booking.guest_email && (
            <div>
              <span className="text-slate-400">Email:</span>{' '}
              {booking.guest_email}
            </div>
          )}
          <div>
            <span className="text-slate-400">Источник:</span>{' '}
            <span className="capitalize">{booking.source}</span>
          </div>
          <div>
            <span className="text-slate-400">Статус:</span>{' '}
            <span className="capitalize">{booking.status}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
