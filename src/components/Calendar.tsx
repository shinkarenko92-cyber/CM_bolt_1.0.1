import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Property, Booking, PropertyRate, supabase } from '../lib/supabase';
import { CalendarHeader } from './CalendarHeader';
import { PropertySidebarRow } from './PropertySidebarRow';
import { BookingBlock } from './BookingBlock';
import { RateCell } from './RateCell';

type CalendarProps = {
  properties: Property[];
  bookings: Booking[];
  onAddReservation: (propertyId: string, checkIn: string, checkOut: string) => void;
  onEditReservation: (booking: Booking) => void;
};

type DateSelection = {
  propertyId: string;
  startDate: string | null;
  endDate: string | null;
};

export function Calendar({
  properties,
  bookings,
  onAddReservation,
  onEditReservation,
}: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [daysToShow] = useState(60);
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(
    new Set(properties.map(p => p.id))
  );
  const [propertyRates, setPropertyRates] = useState<Map<string, PropertyRate[]>>(new Map());
  const [dateSelection, setDateSelection] = useState<DateSelection>({
    propertyId: '',
    startDate: null,
    endDate: null,
  });

  const CELL_WIDTH = 64;

  const dates = Array.from({ length: daysToShow }, (_, i) => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + i);
    return date;
  });

  useEffect(() => {
    loadPropertyRates();
  }, [properties]);

  const loadPropertyRates = async () => {
    if (properties.length === 0) return;

    try {
      const propertyIds = properties.map(p => p.id);
      const { data, error } = await supabase
        .from('property_rates')
        .select('*')
        .in('property_id', propertyIds);

      if (error) throw error;

      const ratesMap = new Map<string, PropertyRate[]>();
      data?.forEach((rate) => {
        const existing = ratesMap.get(rate.property_id) || [];
        ratesMap.set(rate.property_id, [...existing, rate]);
      });

      setPropertyRates(ratesMap);
    } catch (error) {
      console.error('Error loading property rates:', error);
    }
  };

  const handleSaveRate = async (
    propertyId: string,
    date: string,
    dailyPrice: number,
    minStay: number
  ) => {
    try {
      const property = properties.find(p => p.id === propertyId);
      if (!property) return;

      const { data, error } = await supabase
        .from('property_rates')
        .upsert(
          {
            property_id: propertyId,
            date,
            daily_price: dailyPrice,
            min_stay: minStay,
            currency: property.currency,
          },
          { onConflict: 'property_id,date' }
        )
        .select();

      if (error) throw error;

      await loadPropertyRates();
    } catch (error) {
      console.error('Error saving rate:', error);
      throw error;
    }
  };

  const togglePropertyExpansion = (propertyId: string) => {
    const newExpanded = new Set(expandedProperties);
    if (newExpanded.has(propertyId)) {
      newExpanded.delete(propertyId);
    } else {
      newExpanded.add(propertyId);
    }
    setExpandedProperties(newExpanded);
  };

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
  const goToPrevWeek = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - 7);
    setCurrentDate(date);
  };
  const goToNextWeek = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + 7);
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

  const getBookingLayers = (propertyBookings: Booking[]) => {
    const layers: Booking[][] = [];
    const sortedBookings = [...propertyBookings].sort(
      (a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
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

  const calculateVacantCounts = () => {
    const vacantMap = new Map<string, number>();

    dates.forEach((date) => {
      const dateKey = date.toISOString().split('T')[0];
      let vacantCount = 0;

      properties.forEach((property) => {
        const hasBooking = bookings.some(
          (b) => b.property_id === property.id && isDateInRange(date, b.check_in, b.check_out)
        );
        if (!hasBooking) {
          vacantCount++;
        }
      });

      vacantMap.set(dateKey, vacantCount);
    });

    return vacantMap;
  };

  const handleCellClick = (propertyId: string, date: Date) => {
    const dateString = date.toISOString().split('T')[0];

    if (!dateSelection.startDate || dateSelection.propertyId !== propertyId) {
      setDateSelection({
        propertyId,
        startDate: dateString,
        endDate: null,
      });
    } else if (dateSelection.startDate && !dateSelection.endDate) {
      const start = new Date(dateSelection.startDate);
      const end = new Date(dateString);

      if (end <= start) {
        setDateSelection({
          propertyId,
          startDate: dateString,
          endDate: null,
        });
      } else {
        const nextDay = new Date(end);
        nextDay.setDate(nextDay.getDate() + 1);
        const checkOut = nextDay.toISOString().split('T')[0];

        onAddReservation(propertyId, dateSelection.startDate, checkOut);
        setDateSelection({
          propertyId: '',
          startDate: null,
          endDate: null,
        });
      }
    }
  };

  const getRateForDate = (propertyId: string, date: Date): PropertyRate | null => {
    const rates = propertyRates.get(propertyId) || [];
    const dateString = date.toISOString().split('T')[0];
    return rates.find((r) => r.date === dateString) || null;
  };

  const vacantCounts = calculateVacantCounts();

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => onAddReservation('', '', '')}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Reservation
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <CalendarHeader
          dates={dates}
          currentDate={currentDate}
          onPrevMonth={goToPrevMonth}
          onNextMonth={goToNextMonth}
          onPrevWeek={goToPrevWeek}
          onNextWeek={goToNextWeek}
          onToday={goToToday}
          vacantCounts={vacantCounts}
        />

        <div className="flex-1 overflow-auto flex">
          <div className="w-64 flex-shrink-0 overflow-y-auto bg-slate-800 border-r border-slate-700">
            {properties.map((property) => (
              <PropertySidebarRow
                key={property.id}
                property={property}
                isExpanded={expandedProperties.has(property.id)}
                onToggle={() => togglePropertyExpansion(property.id)}
              />
            ))}
          </div>

          <div className="flex-1 overflow-auto">
            <div className="relative">
              {properties.map((property) => {
                if (!expandedProperties.has(property.id)) return null;

                const propertyBookings = bookings.filter((b) => b.property_id === property.id);
                const bookingLayers = getBookingLayers(propertyBookings);
                const rowHeight = Math.max(120, bookingLayers.length * 52 + 68);

                return (
                  <div key={property.id} className="border-b border-slate-700">
                    <div className="relative" style={{ height: `${rowHeight}px` }}>
                      <div className="absolute inset-0 flex">
                        {dates.map((date, i) => {
                          const dateString = date.toISOString().split('T')[0];
                          const isSelected =
                            dateSelection.propertyId === property.id &&
                            dateSelection.startDate === dateString;

                          return (
                            <div
                              key={i}
                              className={`w-16 flex-shrink-0 border-r border-slate-700/50 cursor-pointer hover:bg-slate-800/30 transition-colors ${
                                isSelected ? 'bg-teal-500/20' : ''
                              }`}
                              onClick={() => handleCellClick(property.id, date)}
                            />
                          );
                        })}
                      </div>

                      {bookingLayers.map((layer, layerIndex) =>
                        layer.map((booking) => {
                          const startCol = getBookingStartCol(booking);
                          const span = getBookingSpan(booking);

                          if (startCol < 0 || startCol >= daysToShow) return null;

                          return (
                            <BookingBlock
                              key={booking.id}
                              booking={booking}
                              startCol={startCol}
                              span={Math.min(span, daysToShow - startCol)}
                              layerIndex={layerIndex}
                              cellWidth={CELL_WIDTH}
                              onClick={() => onEditReservation(booking)}
                            />
                          );
                        })
                      )}

                      <div className="absolute bottom-0 left-0 right-0 flex border-t border-slate-700">
                        {dates.map((date, i) => {
                          const rate = getRateForDate(property.id, date);
                          return (
                            <div
                              key={i}
                              className="w-16 flex-shrink-0 border-r border-slate-700/50"
                            >
                              <RateCell
                                date={date}
                                propertyId={property.id}
                                rate={rate}
                                basePrice={property.base_price}
                                baseCurrency={property.currency}
                                baseMinStay={property.minimum_booking_days}
                                onSave={(d, price, minStay) =>
                                  handleSaveRate(property.id, d, price, minStay)
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {properties.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-slate-400">
                    No properties yet. Add your first property to get started.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
