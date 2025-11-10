import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Property, Booking } from '../lib/supabase';

type CalendarProps = {
  properties: Property[];
  bookings: Booking[];
};

export function Calendar({ properties, bookings }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [daysToShow, setDaysToShow] = useState(30);

  const dates = Array.from({ length: daysToShow }, (_, i) => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + i);
    return date;
  });

  const goToToday = () => setCurrentDate(new Date());
  const goToPrevMonth = () => {
    const date = new Date(currentDate);
    date.setMonth(date.getMonth() - 1);
    setCurrentDate(date);
  };
  const goToNextMonth = () => {
    const date = new Date(currentDate);
    date.setMonth(date.getMonth() + 1);
    setCurrentDate(date);
  };

  const isDateInRange = (date: Date, checkIn: string, checkOut: string) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const start = new Date(checkIn);
    start.setHours(0, 0, 0, 0);
    const end = new Date(checkOut);
    end.setHours(0, 0, 0, 0);
    return d >= start && d < end;
  };

  const getBookingForPropertyAndDate = (propertyId: string, date: Date) => {
    return bookings.find(b =>
      b.property_id === propertyId &&
      isDateInRange(date, b.check_in, b.check_out)
    );
  };

  const getBookingStartCol = (booking: Booking) => {
    const startDate = new Date(booking.check_in);
    startDate.setHours(0, 0, 0, 0);
    const firstDate = new Date(dates[0]);
    firstDate.setHours(0, 0, 0, 0);

    if (startDate < firstDate) return 0;

    const diffTime = startDate.getTime() - firstDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getBookingSpan = (booking: Booking) => {
    const start = new Date(booking.check_in);
    const end = new Date(booking.check_out);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const colors = [
    'bg-purple-500', 'bg-blue-500', 'bg-teal-500',
    'bg-green-500', 'bg-yellow-500', 'bg-orange-500', 'bg-pink-500'
  ];

  const getColorForBooking = (bookingId: string) => {
    const hash = bookingId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors">
            + Add reservation
          </button>
          <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors">
            Group reservation
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevMonth}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ChevronsLeft className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={() => {
                const date = new Date(currentDate);
                date.setDate(date.getDate() - 7);
                setCurrentDate(date);
              }}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={goToToday}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => {
                const date = new Date(currentDate);
                date.setDate(date.getDate() + 7);
                setCurrentDate(date);
              }}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={goToNextMonth}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ChevronsRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium">
              View 1
            </button>
            <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors">
              View 2
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-900">
        <div className="inline-block min-w-full">
          <div className="sticky top-0 z-10 bg-slate-800 border-b border-slate-700">
            <div className="flex">
              <div className="w-48 px-4 py-3 font-medium text-slate-300 text-sm border-r border-slate-700">
                Units
              </div>
              <div className="flex">
                {dates.map((date, i) => {
                  const isToday = date.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={i}
                      className={`w-12 px-2 py-3 text-center border-r border-slate-700 ${
                        isToday ? 'bg-teal-500/20' : ''
                      }`}
                    >
                      <div className={`text-xs ${isToday ? 'text-teal-400' : 'text-slate-400'}`}>
                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div className={`text-sm font-medium ${isToday ? 'text-teal-400' : 'text-slate-300'}`}>
                        {date.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            {properties.map((property) => {
              const propertyBookings = bookings.filter(b => b.property_id === property.id);

              return (
                <div key={property.id} className="border-b border-slate-700">
                  <div className="flex">
                    <div className="w-48 px-4 py-3 border-r border-slate-700">
                      <div className="text-sm font-medium text-white">{property.name}</div>
                      <div className="text-xs text-slate-400 mt-1">{property.type}</div>
                    </div>
                    <div className="flex-1 relative" style={{ height: '60px' }}>
                      <div className="absolute inset-0 flex">
                        {dates.map((_, i) => (
                          <div key={i} className="w-12 border-r border-slate-700/50" />
                        ))}
                      </div>

                      {propertyBookings.map((booking) => {
                        const startCol = getBookingStartCol(booking);
                        const span = getBookingSpan(booking);
                        const color = getColorForBooking(booking.id);

                        if (startCol < 0 || startCol >= daysToShow) return null;

                        return (
                          <div
                            key={booking.id}
                            className={`absolute ${color} rounded px-2 py-1 text-white text-xs font-medium overflow-hidden`}
                            style={{
                              left: `${startCol * 48}px`,
                              width: `${Math.min(span, daysToShow - startCol) * 48}px`,
                              top: '8px',
                              height: '44px'
                            }}
                          >
                            <div className="truncate">{booking.guest_name}</div>
                            <div className="text-[10px] opacity-90">
                              {booking.total_price} {booking.currency}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {properties.length === 0 && (
            <div className="text-center py-12">
              <p className="text-slate-400">No properties yet. Add your first property to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
