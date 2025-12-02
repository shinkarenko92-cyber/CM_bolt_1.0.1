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
  hasCheckoutOnSameDay?: boolean;
  hasCheckinOnSameDay?: boolean;
  isStartTruncated?: boolean;
  isEndTruncated?: boolean;
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
  hasCheckoutOnSameDay = false,
  hasCheckinOnSameDay = false,
  isStartTruncated = false,
  isEndTruncated = false,
}: BookingBlockProps) {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const source = (booking.source || 'manual').toLowerCase() as keyof typeof SOURCE_COLORS;
  const colorConfig = SOURCE_COLORS[source] || SOURCE_COLORS.manual;

  const blockHeight = 36;
  const topOffset = 4 + layerIndex * (blockHeight + 8);
  const halfCell = cellWidth / 2;

  const showLeftDiagonal = !isStartTruncated && !hasCheckoutOnSameDay;
  const showRightDiagonal = !isEndTruncated && !hasCheckinOnSameDay;

  const leftOffset = isStartTruncated ? 0 : halfCell;

  const leftPosition = startCol * cellWidth + leftOffset;
  const blockWidth = span * cellWidth - leftOffset + (isEndTruncated ? 0 : halfCell);

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

  const generateClipPath = () => {
    const leftDiag = showLeftDiagonal ? halfCell : 0;
    const rightDiag = showRightDiagonal ? halfCell : 0;
    
    if (leftDiag === 0 && rightDiag === 0) {
      return 'none';
    }
    
    return `polygon(
      0 100%,
      ${leftDiag}px 0,
      calc(100% - ${rightDiag}px) 0,
      100% 100%
    )`;
  };

  const contentPaddingLeft = showLeftDiagonal ? halfCell : 8;
  const contentPaddingRight = showRightDiagonal ? halfCell : 8;

  return (
    <div
      onClick={onClick}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`absolute ${colorConfig.text} text-xs font-medium cursor-grab active:cursor-grabbing transition-all hover:shadow-lg hover:z-20 group ${
        isDragging ? 'opacity-50 cursor-grabbing' : ''
      }`}
      style={{
        left: `${leftPosition}px`,
        width: `${Math.max(blockWidth, halfCell)}px`,
        top: `${topOffset}px`,
        height: `${blockHeight}px`,
        backgroundColor: colorConfig.bg,
        clipPath: generateClipPath(),
        zIndex: 10,
      }}
      data-testid={`booking-block-${booking.id}`}
    >
      <div 
        className="flex items-center h-full overflow-hidden"
        style={{ 
          paddingLeft: `${contentPaddingLeft}px`,
          paddingRight: `${contentPaddingRight}px`,
        }}
      >
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <div className="truncate font-semibold text-[11px]">{booking.guest_name}</div>
          <div
            className="flex-shrink-0 px-1 py-0.5 rounded text-[9px] font-bold border border-white/30"
            style={{ backgroundColor: colorConfig.bg }}
          >
            {colorConfig.badge}
          </div>
        </div>
      </div>

      <div 
        className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:block z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-3 min-w-[250px]"
      >
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
