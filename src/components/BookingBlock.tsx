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
  hasConflict?: boolean; // Для отображения конфликтов
};

// Цвета на основе статуса брони
const getBookingColors = (status: string, hasConflict?: boolean) => {
  if (hasConflict) {
    return {
      bg: 'bg-red-300',
      hover: 'hover:bg-red-400',
      text: 'text-white',
    };
  }

  const statusLower = status.toLowerCase();
  
  if (statusLower === 'paid' || statusLower === 'confirmed') {
    return {
      bg: 'bg-teal-500',
      hover: 'hover:bg-teal-600',
      text: 'text-white',
    };
  }
  
  if (statusLower === 'pending' || statusLower === 'waiting') {
    return {
      bg: 'bg-amber-400',
      hover: 'hover:bg-amber-500',
      text: 'text-white',
    };
  }
  
  // По умолчанию: забронировано (booked/reserved)
  return {
    bg: 'bg-orange-300',
    hover: 'hover:bg-orange-400',
    text: 'text-white',
  };
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
  hasConflict = false,
}: BookingBlockProps) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const colorConfig = getBookingColors(booking.status, hasConflict);
  
  // Определяем, есть ли имя гостя или только телефон
  const hasGuestName = booking.guest_name && booking.guest_name.trim() !== '';
  const isPhoneOnly = !hasGuestName && booking.guest_phone;

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
    if (hasGuestName) {
      return name;
    }
    if (phone && phone.length >= 4) {
      const last4 = phone.slice(-4);
      return `****${last4}`;
    }
    return 'Без имени';
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
      className={`absolute text-xs font-medium cursor-grab active:cursor-grabbing transition-all group overflow-hidden ${
        colorConfig.bg
      } ${colorConfig.hover} ${
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
        zIndex: 5,
      }}
      data-testid={`booking-block-${booking.id}`}
    >
      <div className="flex items-center justify-center h-full px-2 overflow-hidden gap-1">
        {isPhoneOnly && booking.guest_phone && (
          <img 
            src="/whatsapp-icon.svg" 
            alt="WhatsApp" 
            className="w-3 h-3 flex-shrink-0"
          />
        )}
        <div
          className={`truncate text-[11px] font-medium font-roboto ${
            hasGuestName ? 'text-white' : 'text-white/90'
          }`}
        >
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
            {Math.round(booking.total_price)} {booking.currency}
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
