import { useState, useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { Property, Booking, PropertyRate, supabase } from '../lib/supabase';
import { CalendarHeader } from './CalendarHeader';
import { PropertySidebarRow } from './PropertySidebarRow';
import { BookingBlock } from './BookingBlock';
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

type DragState = {
  booking: Booking | null;
  originalPropertyId: string | null;
};

export function Calendar({
  properties,
  bookings,
  onAddReservation,
  onEditReservation,
  onBookingUpdate,
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
  const [dragState, setDragState] = useState<DragState>({
    booking: null,
    originalPropertyId: null,
  });
  const [dragOverCell, setDragOverCell] = useState<{ propertyId: string; dateIndex: number } | null>(null);
  const [dragOverDates, setDragOverDates] = useState<Set<string>>(new Set());
  const [isDragValid, setIsDragValid] = useState(true);
  const [showConditionsModal, setShowConditionsModal] = useState(false);
  const [conditionsModalData, setConditionsModalData] = useState<{
    propertyId: string;
    startDate: string;
    endDate: string;
    price: number;
    minStay: number;
    currency: string;
  } | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const CELL_WIDTH = 64;

  const dates = Array.from({ length: daysToShow }, (_, i) => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + i);
    return date;
  });

  useEffect(() => {
    loadPropertyRates();
  }, [properties]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragState.booking && calendarRef.current) {
        const rect = calendarRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        updateDragOver(x, y);
      }
    };

    const handleMouseUp = () => {
      if (dragState.booking && dragOverCell && isDragValid) {
        handleDrop(dragOverCell.propertyId, dragOverCell.dateIndex);
      }
      setDragState({ booking: null, originalPropertyId: null });
      setDragOverCell(null);
      setDragOverDates(new Set());
      setIsDragValid(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (dragState.booking && calendarRef.current && e.touches[0]) {
        const touch = e.touches[0];
        const rect = calendarRef.current.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        updateDragOver(x, y);
        e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (dragState.booking && dragOverCell && isDragValid) {
        handleDrop(dragOverCell.propertyId, dragOverCell.dateIndex);
      }
      setDragState({ booking: null, originalPropertyId: null });
      setDragOverCell(null);
      setDragOverDates(new Set());
      setIsDragValid(true);
    };

    if (dragState.booking) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [dragState, dragOverCell]);

  const updateDragOver = (x: number, y: number) => {
    const propertyIndex = Math.floor(y / 120);
    const dateIndex = Math.floor((x - 256) / CELL_WIDTH);

    if (propertyIndex >= 0 && propertyIndex < properties.length && dateIndex >= 0 && dateIndex < dates.length) {
      const propertyId = properties[propertyIndex].id;
      setDragOverCell({ propertyId, dateIndex });

      if (dragState.booking) {
        const bookingStart = new Date(dragState.booking.check_in);
        const bookingEnd = new Date(dragState.booking.check_out);
        const duration = Math.ceil((bookingEnd.getTime() - bookingStart.getTime()) / (1000 * 60 * 60 * 24));

        const affectedDates = new Set<string>();
        for (let i = 0; i < duration; i++) {
          const targetDate = new Date(dates[dateIndex]);
          targetDate.setDate(targetDate.getDate() + i);
          affectedDates.add(targetDate.toISOString().split('T')[0]);
        }
        setDragOverDates(affectedDates);

        const targetDate = dates[dateIndex];
        const newCheckIn = targetDate.toISOString().split('T')[0];
        const newCheckOut = new Date(targetDate);
        newCheckOut.setDate(newCheckOut.getDate() + duration);
        const newCheckOutStr = newCheckOut.toISOString().split('T')[0];

        const hasOverlap = bookings.some(b => {
          if (b.id === dragState.booking!.id) return false;
          if (b.property_id !== propertyId) return false;

          const existingStart = new Date(b.check_in);
          const existingEnd = new Date(b.check_out);
          const newStart = new Date(newCheckIn);
          const newEnd = new Date(newCheckOutStr);

          return (
            (newStart >= existingStart && newStart < existingEnd) ||
            (newEnd > existingStart && newEnd <= existingEnd) ||
            (newStart <= existingStart && newEnd >= existingEnd)
          );
        });

        setIsDragValid(!hasOverlap);
      }
    }
  };

  const handleDrop = async (targetPropertyId: string, targetDateIndex: number) => {
    if (!dragState.booking) return;

    const targetDate = dates[targetDateIndex];
    const newCheckIn = targetDate.toISOString().split('T')[0];

    const bookingStart = new Date(dragState.booking.check_in);
    const bookingEnd = new Date(dragState.booking.check_out);
    const duration = Math.ceil((bookingEnd.getTime() - bookingStart.getTime()) / (1000 * 60 * 60 * 24));

    const newCheckOut = new Date(targetDate);
    newCheckOut.setDate(newCheckOut.getDate() + duration);
    const newCheckOutStr = newCheckOut.toISOString().split('T')[0];

    const hasOverlap = bookings.some(b => {
      if (b.id === dragState.booking!.id) return false;
      if (b.property_id !== targetPropertyId) return false;

      const existingStart = new Date(b.check_in);
      const existingEnd = new Date(b.check_out);
      const newStart = new Date(newCheckIn);
      const newEnd = new Date(newCheckOutStr);

      return (
        (newStart >= existingStart && newStart < existingEnd) ||
        (newEnd > existingStart && newEnd <= existingEnd) ||
        (newStart <= existingStart && newEnd >= existingEnd)
      );
    });

    if (hasOverlap) {
      alert('Невозможно переместить бронь: пересечение с существующей бронью');
      return;
    }

    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          property_id: targetPropertyId,
          check_in: newCheckIn,
          check_out: newCheckOutStr,
        })
        .eq('id', dragState.booking.id);

      if (error) throw error;

      onBookingUpdate(dragState.booking.id, {
        property_id: targetPropertyId,
        check_in: newCheckIn,
        check_out: newCheckOutStr,
      });
    } catch (error) {
      console.error('Error moving booking:', error);
      alert('Ошибка перемещения брони');
    }
  };

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

  const togglePropertyExpansion = (propertyId: string) => {
    const newExpanded = new Set(expandedProperties);
    if (newExpanded.has(propertyId)) {
      newExpanded.delete(propertyId);
    } else {
      newExpanded.add(propertyId);
    }
    setExpandedProperties(newExpanded);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setTimeout(() => {
      if (calendarRef.current) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const firstDate = new Date(dates[0]);
        firstDate.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - firstDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays >= 0 && diffDays < daysToShow) {
          const scrollContainer = calendarRef.current.querySelector('.flex-1.overflow-auto');
          if (scrollContainer) {
            const scrollLeft = diffDays * CELL_WIDTH;
            scrollContainer.scrollTo({ left: scrollLeft, behavior: 'smooth' });
          }
        }
      }
    }, 100);
  };
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
        setDateSelection({
          propertyId,
          startDate: dateSelection.startDate,
          endDate: dateString,
        });
      }
    }
  };

  const handleOpenConditionsModal = () => {
    if (dateSelection.startDate && dateSelection.endDate) {
      const property = properties.find(p => p.id === dateSelection.propertyId);
      if (!property) return;

      const rate = getRateForDate(dateSelection.propertyId, new Date(dateSelection.startDate));

      setConditionsModalData({
        propertyId: dateSelection.propertyId,
        startDate: dateSelection.startDate,
        endDate: dateSelection.endDate,
        price: rate?.daily_price || property.base_price,
        minStay: rate?.min_stay || property.minimum_booking_days,
        currency: property.currency,
      });
      setShowConditionsModal(true);
    }
  };

  const handleCloseConditionsModal = () => {
    setShowConditionsModal(false);
    setConditionsModalData(null);
    setDateSelection({
      propertyId: '',
      startDate: null,
      endDate: null,
    });
  };

  const getRateForDate = (propertyId: string, date: Date): PropertyRate | null => {
    const rates = propertyRates.get(propertyId) || [];
    const dateString = date.toISOString().split('T')[0];
    return rates.find((r) => r.date === dateString) || null;
  };

  const isCellOccupied = (propertyId: string, date: Date): boolean => {
    return bookings.some(b => b.property_id === propertyId && isDateInRange(date, b.check_in, b.check_out));
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAddReservation('', '', '')}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Добавить бронь
          </button>
          {dateSelection.startDate && dateSelection.endDate && (
            <button
              onClick={handleOpenConditionsModal}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Изменить условия
            </button>
          )}
        </div>
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
        />

        <div className="flex-1 overflow-auto flex" ref={calendarRef}>
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
                    <div className="border-b border-slate-700/30 bg-slate-800/50">
                      <div className="h-8 flex">
                        {dates.map((date, i) => {
                          const rate = getRateForDate(property.id, date);
                          const displayMinStay = rate?.min_stay || property.minimum_booking_days;

                          return (
                            <div
                              key={i}
                              className="w-16 flex-shrink-0 border-r border-slate-700/30 flex items-center justify-center"
                            >
                              <div className="text-[10px] font-medium text-slate-500">
                                {displayMinStay}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="relative" style={{ height: `${rowHeight}px` }}>
                      <div className="absolute inset-0 flex">
                        {dates.map((date, i) => {
                          const dateString = date.toISOString().split('T')[0];
                          const isSelected =
                            dateSelection.propertyId === property.id &&
                            dateSelection.startDate === dateString;
                          const isInRange =
                            dateSelection.propertyId === property.id &&
                            dateSelection.startDate &&
                            dateSelection.endDate &&
                            dateString >= dateSelection.startDate &&
                            dateString <= dateSelection.endDate;
                          const isOccupied = isCellOccupied(property.id, date);
                          const rate = getRateForDate(property.id, date);
                          const displayPrice = rate?.daily_price || property.base_price;
                          const displayCurrency = rate?.currency || property.currency;
                          const isDragOverThisCell = dragOverDates.has(dateString) && dragOverCell?.propertyId === property.id;
                          const dragOverColor = isDragValid ? 'bg-green-500/30' : 'bg-red-500/30';

                          return (
                            <div
                              key={i}
                              className={`w-16 flex-shrink-0 border-r border-slate-700/50 cursor-pointer transition-colors ${
                                isSelected ? 'bg-teal-500/20' : ''
                              } ${isInRange ? 'bg-blue-500/10' : ''} ${isDragOverThisCell ? dragOverColor : ''} ${!isOccupied ? 'hover:bg-slate-800/30' : ''}`}
                              onClick={() => !isOccupied && handleCellClick(property.id, date)}
                            >
                              {!isOccupied && (
                                <div className="h-full flex flex-col items-center justify-center text-center p-1">
                                  <div className="text-[10px] font-medium text-slate-400">
                                    {displayPrice} {displayCurrency}
                                  </div>
                                  <div className="text-[9px] text-slate-500 mt-1">
                                    Vacant
                                  </div>
                                </div>
                              )}
                            </div>
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
                              onDragStart={(b) => setDragState({ booking: b, originalPropertyId: property.id })}
                              onDragEnd={() => setDragState({ booking: null, originalPropertyId: null })}
                              isDragging={dragState.booking?.id === booking.id}
                            />
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}

              {properties.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-slate-400">
                    Нет объектов. Добавьте первый объект для начала работы.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showConditionsModal && conditionsModalData && (
        <ChangeConditionsModal
          isOpen={showConditionsModal}
          onClose={handleCloseConditionsModal}
          propertyId={conditionsModalData.propertyId}
          startDate={conditionsModalData.startDate}
          endDate={conditionsModalData.endDate}
          currentPrice={conditionsModalData.price}
          currentMinStay={conditionsModalData.minStay}
          currency={conditionsModalData.currency}
        />
      )}
    </div>
  );
}
