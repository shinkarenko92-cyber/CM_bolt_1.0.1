import { Booking } from '../lib/supabase';

type BookingBlockProps = {
  booking: Booking;
  startCol: number;
  span: number;
  layerIndex: number;
  cellWidth: number;
  onClick: () => void;
};

const SOURCE_COLORS = {
  avito: { bg: 'bg-[#4CAF50]', text: 'text-white', badge: 'A' },
  cian: { bg: 'bg-[#2196F3]', text: 'text-white', badge: 'C' },
  booking: { bg: 'bg-[#F44336]', text: 'text-white', badge: 'B' },
  airbnb: { bg: 'bg-[#FF5A5F]', text: 'text-white', badge: 'Ab' },
  manual: { bg: 'bg-slate-600', text: 'text-white', badge: 'M' },
};

export function BookingBlock({
  booking,
  startCol,
  span,
  layerIndex,
  cellWidth,
  onClick,
}: BookingBlockProps) {
  const source = booking.source.toLowerCase() as keyof typeof SOURCE_COLORS;
  const colorConfig = SOURCE_COLORS[source] || SOURCE_COLORS.manual;

  const topOffset = 8 + layerIndex * 52;
  const hasCheckout = span > 1;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  return (
    <div
      onClick={onClick}
      className={`absolute ${colorConfig.bg} rounded px-2 py-1 ${colorConfig.text} text-xs font-medium cursor-pointer transition-all hover:shadow-lg hover:z-10 group`}
      style={{
        left: `${startCol * cellWidth}px`,
        width: `${span * cellWidth}px`,
        top: `${topOffset}px`,
        height: '44px',
        opacity: hasCheckout ? 1 : 0.7,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="truncate font-semibold">{booking.guest_name}</div>
          <div className="text-[10px] opacity-90 truncate">
            {booking.total_price} {booking.currency}
          </div>
        </div>
        <div className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${colorConfig.bg} bg-opacity-80 border border-white/30`}>
          {colorConfig.badge}
        </div>
      </div>

      {hasCheckout && (
        <div
          className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-black/20 to-transparent pointer-events-none"
          style={{
            background: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.1), rgba(0,0,0,0.1) 10px, transparent 10px, transparent 20px)',
          }}
        />
      )}

      <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-3 min-w-[250px]">
        <div className="text-white font-semibold mb-2 text-sm">
          {booking.guest_name}
        </div>
        <div className="text-slate-300 text-xs space-y-1">
          <div>
            <span className="text-slate-400">Check-in:</span>{' '}
            {formatDate(booking.check_in)}
          </div>
          <div>
            <span className="text-slate-400">Check-out:</span>{' '}
            {formatDate(booking.check_out)}
          </div>
          <div>
            <span className="text-slate-400">Price:</span>{' '}
            {booking.total_price} {booking.currency}
          </div>
          {booking.guest_phone && (
            <div>
              <span className="text-slate-400">Phone:</span>{' '}
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
            <span className="text-slate-400">Source:</span>{' '}
            <span className="capitalize">{booking.source}</span>
          </div>
          <div>
            <span className="text-slate-400">Status:</span>{' '}
            <span className="capitalize">{booking.status}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
