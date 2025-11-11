import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Property, Booking } from '../lib/supabase';

type CalendarProps = {
  properties: Property[];
  bookings: Booking[];
  onAddReservation: (propertyIds: string[]) => void;
  onEditReservation: (booking: Booking) => void;
};

export function Calendar({ properties, bookings, onAddReservation, onEditReservation }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [daysToShow, setDaysToShow] = useState(30);
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);

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

  const handlePropertyClick = (propertyId: string, event: React.MouseEvent) => {
    if (event.shiftKey) {
      if (selectedProperties.includes(propertyId)) {
        setSelectedProperties(selectedProperties.filter(id => id !== propertyId));
      } else {
        setSelectedProperties([...selectedProperties, propertyId]);
      }
    } else {
      setSelectedProperties([propertyId]);
    }
  };

  const handleAddReservation = () => {
    if (selectedProperties.length > 0) {
      onAddReservation(selectedProperties);
    } else {
      onAddReservation([]);
    }
  };

  const handleGroupReservation = () => {
    if (selectedProperties.length > 1) {
      onAddReservation(selectedProperties);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-blue-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-slate-500';
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={handleAddReservation}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + Add reservation
          </button>
          <button
            onClick={handleGroupReservation}
            disabled={selectedProperties.length < 2}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Group reservation {selectedProperties.length > 1 ? `(${selectedProperties.length})` : ''}
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

              const getBookingLayers = () => {
                const layers: Booking[][] = [];
                const sortedBookings = [...propertyBookings].sort((a, b) =>
                  new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
                );

                sortedBookings.forEach((booking) => {
                  let placed = false;
                  for (let i = 0; i < layers.length; i++) {
                    const layer = layers[i];
                    const hasOverlap = layer.some((existingBooking) => {
                      const newStart = new Date(booking.check_in);
                      const newEnd = new Date(booking.check_out);
                      const existingStart = new Date(existingBooking.check_in);
                      const existingEnd = new Date(existingBooking.check_out);

                      return (
                        (newStart >= existingStart && newStart < existingEnd) ||
                        (newEnd > existingStart && newEnd <= existingEnd) ||
                        (newStart <= existingStart && newEnd >= existingEnd)
                      );
                    });

                    if (!hasOverlap) {
                      layer.push(booking);
                      placed = true;
                      break;
                    }
                  }

                  if (!placed) {
                    layers.push([booking]);
                  }
                });

                return layers;
              };

              const bookingLayers = getBookingLayers();
              const rowHeight = Math.max(60, bookingLayers.length * 52);
              const isSelected = selectedProperties.includes(property.id);

              return (
                <div key={property.id} className="border-b border-slate-700">
                  <div className="flex">
                    <div
                      className={`w-48 px-4 py-3 border-r border-slate-700 cursor-pointer transition-colors ${
                        isSelected ? 'bg-teal-500/20 border-l-4 border-l-teal-500' : 'hover:bg-slate-800'
                      }`}
                      onClick={(e) => handlePropertyClick(property.id, e)}
                    >
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <div className="w-4 h-4 bg-teal-500 rounded flex items-center justify-center">
                            <span className="text-white text-xs">✓</span>
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-white">{property.name}</div>
                          <div className="text-xs text-slate-400 mt-1">{property.type}</div>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 relative" style={{ height: `${rowHeight}px` }}>
                      <div className="absolute inset-0 flex">
                        {dates.map((_, i) => (
                          <div key={i} className="w-12 border-r border-slate-700/50" />
                        ))}
                      </div>

                      {bookingLayers.map((layer, layerIndex) => (
                        layer.map((booking) => {
                          const startCol = getBookingStartCol(booking);
                          const span = getBookingSpan(booking);

                          if (startCol < 0 || startCol >= daysToShow) return null;

                          const statusColor = getStatusColor(booking.status);
                          const topOffset = 8 + (layerIndex * 52);

                          return (
                            <div
                              key={booking.id}
                              onClick={() => onEditReservation(booking)}
                              className={`absolute ${statusColor} rounded px-2 py-1 text-white text-xs font-medium overflow-hidden cursor-pointer hover:opacity-90 transition-opacity`}
                              style={{
                                left: `${startCol * 48}px`,
                                width: `${Math.min(span, daysToShow - startCol) * 48}px`,
                                top: `${topOffset}px`,
                                height: '44px',
                                clipPath: span > 1 ? `polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)` : undefined
                              }}
                              title={`${booking.guest_name} - ${booking.total_price} ${booking.currency} - ${booking.status}`}
                            >
                              <div className="truncate font-semibold">{booking.guest_name}</div>
                              <div className="text-[10px] opacity-90">
                                {booking.total_price} {booking.currency}
                              </div>
                            </div>
                          );
                        })
                      ))}
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
