import { useState, useEffect, useRef } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Property, Booking, PropertyRate, supabase } from '../lib/supabase';
import { ChangeConditionsModal } from './ChangeConditionsModal';

type CalendarProps = {
  properties: Property[];
  bookings: Booking[];
  onAddReservation: (propertyId: string, checkIn: string, checkOut: string) => void;
  onEditReservation: (booking: Booking) => void;
  onBookingUpdate: (bookingId: string, updates: Partial<Booking>) => void;
};

type DateSelection = {
  propertyId: string;
  startDate: string | null;
  endDate: string | null;
};

const CURRENT_DATE = new Date('2025-11-12');

export function Calendar({
  properties,
  bookings,
  onAddReservation,
  onEditReservation,
  onBookingUpdate,
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(CURRENT_DATE));
  const [propertyRates, setPropertyRates] = useState<Map<string, PropertyRate[]>>(new Map());
  const [dateSelection, setDateSelection] = useState<DateSelection>({
    propertyId: '',
    startDate: null,
    endDate: null,
  });
  const [showConditionsModal, setShowConditionsModal] = useState(false);
  const [conditionsModalData, setConditionsModalData] = useState<{
    propertyId: string;
    startDate: string;
    endDate: string;
    price: number;
    minStay: number;
    currency: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  useEffect(() => {
    loadPropertyRates();
  }, [properties]);

  useEffect(() => {
    goToToday();
  }, [currentMonth]);

  const goToToday = () => {
    setTimeout(() => {
      if (scrollRef.current && days.length > 0) {
        const todayDate = CURRENT_DATE.getDate();
        const todayIndex = days.findIndex(d => d.getDate() === todayDate);
        if (todayIndex !== -1) {
          const cellWidth = 48;
          const offset = todayIndex * cellWidth - (scrollRef.current.clientWidth / 2) + (cellWidth / 2);
          scrollRef.current.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
        }
      }
    }, 100);
  };

  const loadPropertyRates = async () => {
    const ratesMap = new Map<string, PropertyRate[]>();
    for (const property of properties) {
      const { data, error } = await supabase
        .from('property_rates')
        .select('*')
        .eq('property_id', property.id)
        .order('date', { ascending: true });

      if (!error && data) {
        ratesMap.set(property.id, data);
      }
    }
    setPropertyRates(ratesMap);
  };

  const getRateForDate = (propertyId: string, date: Date): PropertyRate | undefined => {
    const rates = propertyRates.get(propertyId) || [];
    const dateString = date.toISOString().split('T')[0];
    return rates.find(rate => rate.date === dateString);
  };

  const handleCellClick = (propertyId: string, date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    const property = properties.find(p => p.id === propertyId);
    if (!property) return;

    if (!dateSelection.startDate || dateSelection.propertyId !== propertyId) {
      setDateSelection({
        propertyId,
        startDate: dateString,
        endDate: null,
      });
    } else if (!dateSelection.endDate) {
      const start = new Date(dateSelection.startDate);
      const end = new Date(dateString);

      if (end < start) {
        setDateSelection({
          propertyId,
          startDate: dateString,
          endDate: dateSelection.startDate,
        });
      } else {
        setDateSelection({
          propertyId,
          startDate: dateSelection.startDate,
          endDate: dateString,
        });
      }

      const rate = getRateForDate(propertyId, start);
      setConditionsModalData({
        propertyId,
        startDate: dateSelection.startDate,
        endDate: dateString,
        price: rate?.daily_price || property.base_price,
        minStay: rate?.min_stay || property.minimum_booking_days,
        currency: rate?.currency || property.currency,
      });
      setShowConditionsModal(true);
    }
  };

  const handleConditionsSubmit = () => {
    if (conditionsModalData) {
      const start = new Date(conditionsModalData.startDate);
      const end = new Date(conditionsModalData.endDate);
      start.setDate(start.getDate() + 1);
      end.setDate(end.getDate() + 1);

      onAddReservation(
        conditionsModalData.propertyId,
        start.toISOString().split('T')[0],
        end.toISOString().split('T')[0]
      );
    }
    setShowConditionsModal(false);
    setConditionsModalData(null);
    setDateSelection({ propertyId: '', startDate: null, endDate: null });
  };

  const handleConditionsCancel = () => {
    setShowConditionsModal(false);
    setConditionsModalData(null);
    setDateSelection({ propertyId: '', startDate: null, endDate: null });
  };

  const getBookingPosition = (booking: Booking, dayIndex: number): boolean => {
    const checkIn = new Date(booking.check_in);
    const checkOut = new Date(booking.check_out);
    const dayDate = days[dayIndex];

    if (!dayDate) return false;

    return dayDate >= checkIn && dayDate < checkOut;
  };

  const isBookingStart = (booking: Booking, dayIndex: number): boolean => {
    const checkIn = new Date(booking.check_in);
    const dayDate = days[dayIndex];
    return dayDate && dayDate.toDateString() === checkIn.toDateString();
  };

  const renderBooking = (propertyId: string, dayIndex: number) => {
    const propertyBookings = bookings.filter(b => b.property_id === propertyId);

    return propertyBookings.map(booking => {
      if (!getBookingPosition(booking, dayIndex)) return null;
      if (!isBookingStart(booking, dayIndex)) return null;

      const checkIn = new Date(booking.check_in);
      const checkOut = new Date(booking.check_out);
      const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

      const startIndex = days.findIndex(d => d.toDateString() === checkIn.toDateString());
      const endIndex = days.findIndex(d => d.toDateString() === checkOut.toDateString());

      const visibleNights = endIndex >= 0 ? endIndex - startIndex : nights;

      return (
        <div
          key={booking.id}
          className="absolute top-1 h-10 rounded-lg bg-red-500 bg-opacity-90 text-white text-xs flex items-center overflow-hidden"
          style={{
            left: '2px',
            right: '2px',
            width: `calc(${visibleNights * 48}px - 4px)`,
            zIndex: 10,
          }}
        >
          <span className="absolute left-1 top-0.5 text-xs font-bold">
            D
          </span>
          <span className="mx-6 truncate text-xs">{booking.guest_name}</span>
          <span className="absolute right-1 top-0.5 text-xs">
            {booking.total_price} {booking.currency}
          </span>
        </div>
      );
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Month Navigation */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 hover:bg-slate-700 rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold min-w-[200px] text-center">
            {format(currentMonth, 'LLLL yyyy', { locale: ru })}
          </h2>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 hover:bg-slate-700 rounded-lg transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <button
          onClick={() => {
            setCurrentMonth(startOfMonth(CURRENT_DATE));
            setTimeout(goToToday, 100);
          }}
          className="px-4 py-2 bg-teal-500 hover:bg-teal-600 rounded-lg text-sm font-medium transition"
        >
          Сегодня
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="min-w-max">
          {/* Header: Days */}
          <div className="sticky top-0 z-20 bg-slate-900 border-b border-slate-700 pb-2 mb-2">
            <div className="flex">
              <div className="w-48 flex-shrink-0 text-sm font-medium text-slate-400 px-4 py-2">
                Объекты
              </div>
              {days.map((day, i) => (
                <div
                  key={i}
                  className={`w-12 flex-shrink-0 text-center ${
                    isToday(day) ? 'text-teal-400' : 'text-slate-400'
                  }`}
                >
                  <div className="text-xs font-medium">
                    {format(day, 'EEE', { locale: ru }).slice(0, 2)}
                  </div>
                  <div className={`text-lg ${isToday(day) ? 'text-white font-bold' : ''}`}>
                    {day.getDate()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Properties */}
          {properties.map((property) => (
            <div key={property.id} className="border-b border-slate-800">
              {/* Property Name + Prices Row */}
              <div className="flex items-center py-2">
                <div className="w-48 flex-shrink-0 font-medium text-white px-4">
                  {property.name}
                </div>
                {days.map((day, i) => {
                  const rate = getRateForDate(property.id, day);
                  const displayPrice = rate?.daily_price || property.base_price;
                  const hasBooking = bookings.some(b =>
                    b.property_id === property.id && getBookingPosition(b, i)
                  );

                  return (
                    <div key={i} className="w-12 flex-shrink-0 text-center">
                      {!hasBooking && (
                        <span className="text-xs text-slate-400">{displayPrice}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bookings Row */}
              <div className="flex relative h-12">
                <div className="w-48 flex-shrink-0"></div>
                {days.map((day, i) => {
                  const dateString = day.toISOString().split('T')[0];
                  const hasBooking = bookings.some(b =>
                    b.property_id === property.id && getBookingPosition(b, i)
                  );
                  const isSelected = dateSelection.propertyId === property.id &&
                    dateSelection.startDate === dateString;
                  const isInRange = dateSelection.propertyId === property.id &&
                    dateSelection.startDate &&
                    dateSelection.endDate &&
                    new Date(dateString) >= new Date(dateSelection.startDate) &&
                    new Date(dateString) <= new Date(dateSelection.endDate);

                  return (
                    <div
                      key={i}
                      className={`w-12 flex-shrink-0 relative border border-slate-700 mx-0.5 rounded cursor-pointer transition-colors ${
                        isToday(day) ? 'bg-teal-500/10' : ''
                      } ${isSelected ? 'bg-teal-500/20' : ''} ${
                        isInRange ? 'bg-blue-500/10' : ''
                      } ${!hasBooking ? 'hover:bg-slate-800/30' : ''}`}
                      onClick={() => !hasBooking && handleCellClick(property.id, day)}
                    >
                      {renderBooking(property.id, i)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showConditionsModal && conditionsModalData && (
        <ChangeConditionsModal
          isOpen={showConditionsModal}
          onClose={handleConditionsCancel}
          onConfirm={handleConditionsSubmit}
          initialPrice={conditionsModalData.price}
          initialMinStay={conditionsModalData.minStay}
          initialCurrency={conditionsModalData.currency}
        />
      )}
    </div>
  );
}
