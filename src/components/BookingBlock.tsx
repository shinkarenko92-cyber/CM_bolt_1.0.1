import { useRef } from 'react';
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
  isStartTruncated?: boolean;
  isEndTruncated?: boolean;
};

const SOURCE_COLORS = {
  avito: { bg: '#E8998D', text: 'text-white', badge: 'A' },
  cian: { bg: '#E8998D', text: 'text-white', badge: 'C' },
  booking: { bg: '#E8998D', text: 'text-white', badge: 'B' },
  airbnb: { bg: '#E8998D', text: 'text-white', badge: 'Ab' },
  manual: { bg: '#E8998D', text: 'text-white', badge: 'M' },
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
  isStartTruncated = false,
  isEndTruncated = false,
}: BookingBlockProps) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const source = (booking.source || 'manual').toLowerCase() as keyof typeof SOURCE_COLORS;
  const colorConfig = SOURCE_COLORS[source] || SOURCE_COLORS.manual;

  const blockHeight = 24;
  const topOffset = 8 + layerIndex * (blockHeight + 8);

  const halfCell = cellWidth / 2;
  const leftMargin = isStartTruncated ? 0 : 2;
  const rightMargin = isEndTruncated ? 0 : 2;
  
  const startOffset = isStartTruncated ? 0 : halfCell;
  
  const leftPosition = startCol * cellWidth + startOffset + leftMargin;
  const blockWidth = span * cellWidth - leftMargin - rightMargin;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  // Функция форматирования отображения гостя в календаре
  const formatGuestDisplay = (name: string, phone: string | null): string => {
    if (phone && phone.length >= 4) {
      const last4 = phone.slice(-4);
      return `${name} (****${last4})`;
    }
    return name;
  };

  // Функция форматирования номера для WhatsApp (только цифры, без +)
  const formatPhoneForWhatsApp = (phone: string | null): string | null => {
    if (!phone) return null;
    // Убираем все нецифровые символы, включая +
    return phone.replace(/\D/g, '');
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      onDragStart(booking);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    setTimeout(() => {
      if (touchStartRef.current) {
        onDragStart(booking);
      }
    }, 200);
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
    onDragEnd();
  };

  return (
    <div
      onClick={onClick}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`absolute text-xs font-medium cursor-grab active:cursor-grabbing transition-all hover:brightness-110 group overflow-hidden ${
        isStartTruncated ? '' : 'rounded-l-md'
      } ${
        isEndTruncated ? '' : 'rounded-r-md'
      } ${
        isDragging ? 'opacity-50 cursor-grabbing' : ''
      }`}
      style={{
        left: `${leftPosition}px`,
        width: `${Math.max(blockWidth, 20)}px`,
        top: `${topOffset}px`,
        height: `${blockHeight}px`,
        backgroundColor: colorConfig.bg,
        zIndex: 5,
      }}
      data-testid={`booking-block-${booking.id}`}
    >
      <div className="flex items-center justify-center h-full px-2 overflow-hidden">
        <div className="truncate text-white font-medium text-[11px]">
          {formatGuestDisplay(booking.guest_name, booking.guest_phone)}
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
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Телефон:</span>
              <span>{booking.guest_phone}</span>
              <a
                href={`https://wa.me/${formatPhoneForWhatsApp(booking.guest_phone)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-green-600/20 transition-colors"
                onClick={(e) => e.stopPropagation()}
                title="Открыть в WhatsApp"
              >
                <img 
                  src="/whatsapp-icon.svg" 
                  alt="WhatsApp" 
                  className="w-4 h-4"
                />
              </a>
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
