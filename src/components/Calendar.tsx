import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { Popover, InputNumber, Button } from 'antd';
import { parseISO, format, addDays, isBefore, isSameDay } from 'date-fns';
import { Property, Booking, PropertyRate, supabase } from '../lib/supabase';
import { CalendarHeader } from './CalendarHeader';
import { BookingBlock } from './BookingBlock';
import { ChangeConditionsModal } from './ChangeConditionsModal';
import { SortablePropertyRow } from './SortablePropertyRow';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

type CalendarProps = {
  properties: Property[];
  bookings: Booking[];
  onAddReservation: (propertyId: string, checkIn: string, checkOut: string) => void;
  onEditReservation: (booking: Booking) => void;
  onBookingUpdate: (bookingId: string, updates: Partial<Booking>) => void;
  onPropertiesUpdate?: (properties: Property[]) => void;
  onDateSelectionReset?: () => void;
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

// Property groups removed: calendar uses a flat list of properties

export function Calendar({
  properties,
  bookings,
  onAddReservation,
  onEditReservation,
  onBookingUpdate,
  onPropertiesUpdate,
  onDateSelectionReset,
}: CalendarProps) {
  // We want the left edge to show 2 days before the anchor day (today / selected date).
  // With 60 days window where anchor is at index centerOffset, we scroll to (centerOffset - 2).
  const DAYS_BEFORE_TODAY_VISIBLE = 2;
  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const centerOffset = Math.floor(60 / 2);
    const startDate = new Date(localToday);
    startDate.setDate(startDate.getDate() - centerOffset);
    return startDate;
  });
  const [daysToShow] = useState(60);
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(
    new Set(properties.map(p => p.id))
  );
  const [propertyRates, setPropertyRates] = useState<Map<string, PropertyRate[]>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
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
  const [minStayPopoverOpen, setMinStayPopoverOpen] = useState<{ propertyId: string; date: string } | null>(null);
  const [minStayValue, setMinStayValue] = useState<number>(1);
  const [isSavingMinStay, setIsSavingMinStay] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const seenPropertyIds = useRef<Set<string>>(new Set());

  const CELL_WIDTH = 64;

  const currentDateTimestamp = currentDate.getTime();
  
  const dates = useMemo(() => {
    const datesArray = Array.from({ length: daysToShow }, (_, i) => {
      const date = new Date(currentDateTimestamp);
      date.setDate(date.getDate() + i);
      return date;
    });
    console.log('Calendar dates:', datesArray.length);
    return datesArray;
  }, [currentDateTimestamp, daysToShow]);

  const centerDate = useMemo(() => {
    return dates[Math.floor(daysToShow / 2)] || new Date(currentDateTimestamp);
  }, [dates, daysToShow, currentDateTimestamp]);

  const [visibleDate, setVisibleDate] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  });
  
  const initialScrollDone = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Группы объявлений удалены: ничего не загружаем

  useEffect(() => {
    loadPropertyRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties]);

  // Автоматически разворачиваем только действительно новые объекты при их загрузке
  // seenPropertyIds отслеживает все объекты, которые мы когда-либо видели
  useEffect(() => {
    if (properties.length > 0) {
      // Находим объекты, которые мы ещё никогда не видели
      const trulyNewPropertyIds = properties
        .filter(p => !seenPropertyIds.current.has(p.id))
        .map(p => p.id);
      
      // Добавляем все текущие объекты в список "виденных"
      properties.forEach(p => seenPropertyIds.current.add(p.id));
      
      // Разворачиваем только действительно новые объекты
      if (trulyNewPropertyIds.length > 0) {
        setExpandedProperties(prev => {
          const newExpanded = new Set(prev);
          trulyNewPropertyIds.forEach(id => newExpanded.add(id));
          return newExpanded;
        });
      }
    }
  }, [properties]);

  // Группы удалены: expandedGroups не используется

  // При изменении текущей базовой даты центрируем скролл и обновляем "видимую" дату
  // ВАЖНО: НЕ сбрасываем expandedGroups или expandedProperties при изменении дат
  useEffect(() => {
    console.log('Calendar: currentDate changed, updating scroll position', {
      currentDateTimestamp,
      expandedPropertiesSize: expandedProperties.size,
      propertiesCount: properties.length,
    });
    
    const centerOffset = Math.floor(60 / 2);
    const scrollLeft = Math.max(0, (centerOffset - DAYS_BEFORE_TODAY_VISIBLE) * CELL_WIDTH);

    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTo({ left: scrollLeft, behavior: 'auto' });
    }

    setVisibleDate(centerDate);
    initialScrollDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDateTimestamp]);

  // Обновление текущей видимой даты и позиции заголовка по горизонтальному скроллу
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleBodyScroll = () => {
      if (!initialScrollDone.current) return;
      
      const { scrollLeft, clientWidth } = scrollContainer;
      
      const startIndex = Math.max(0, Math.round(scrollLeft / CELL_WIDTH));
      const daysInView = Math.max(1, Math.floor(clientWidth / CELL_WIDTH));
      const centerIndex = Math.min(
        dates.length - 1,
        startIndex + Math.floor(daysInView / 2)
      );

      const newVisibleDate = dates[centerIndex];
      if (newVisibleDate) {
        setVisibleDate(newVisibleDate);
      }
    };

    scrollContainer.addEventListener('scroll', handleBodyScroll);
    return () => {
      scrollContainer.removeEventListener('scroll', handleBodyScroll);
    };
  }, [dates]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState, dragOverCell]);

  const getPropertyRowHeight = (property: Property) => {
    const first = dates[0];
    const firstVisibleDate = new Date(first.getFullYear(), first.getMonth(), first.getDate(), 0, 0, 0, 0);
    const last = dates[dates.length - 1];
    const lastVisibleDate = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999);

    const propertyBookings = bookings.filter((b) => {
      if (b.property_id !== property.id) return false;
      const checkInDate = new Date(b.check_in);
      const checkIn = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate());
      const checkOutDate = new Date(b.check_out);
      const checkOut = new Date(checkOutDate.getFullYear(), checkOutDate.getMonth(), checkOutDate.getDate());
      return checkOut > firstVisibleDate && checkIn <= lastVisibleDate;
    });

    const isExpanded = expandedProperties.has(property.id);
    const bookingLayers = getBookingLayers(propertyBookings);
    const rowHeight = Math.max(44, bookingLayers.length * 32 + 16);
    const collapsedHeight = 48;
    return isExpanded ? 32 + rowHeight : collapsedHeight;
  };

  const getPropertyAtY = (y: number): { propertyId: string; propertyIndex: number } | null => {
    let accumulatedHeight = 0;
    for (let i = 0; i < properties.length; i++) {
      const rowHeight = getPropertyRowHeight(properties[i]);
      if (y >= accumulatedHeight && y < accumulatedHeight + rowHeight) {
        return { propertyId: properties[i].id, propertyIndex: i };
      }
      accumulatedHeight += rowHeight;
    }
    return null;
  };

  const updateDragOver = (x: number, y: number) => {
    const propertyInfo = getPropertyAtY(y);
    const dateIndex = Math.floor((x - 256) / CELL_WIDTH);

    if (propertyInfo && dateIndex >= 0 && dateIndex < dates.length) {
      const { propertyId } = propertyInfo;
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
    } else {
      setDragOverCell(null);
      setDragOverDates(new Set());
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

  const loadPropertyRates = async (retryCount = 0): Promise<void> => {
    if (properties.length === 0) {
      setPropertyRates(new Map());
      return;
    }

    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    try {
      const propertyIds = properties.map(p => p.id);
      const { data, error } = await supabase
        .from('property_rates')
        .select('*')
        .in('property_id', propertyIds);

      if (error) {
        console.error('Error loading property rates:', error);
        
        // Retry logic
        if (retryCount < maxRetries) {
          console.log(`Retrying loadPropertyRates (attempt ${retryCount + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
          return loadPropertyRates(retryCount + 1);
        }
        
        // After max retries, show warning and use empty rates
        console.warn('Failed to load property rates after retries, using empty rates');
        toast.error('Цены не загружены, попробуй позже');
        setPropertyRates(new Map());
        return;
      }

      const ratesMap = new Map<string, PropertyRate[]>();
      data?.forEach((rate) => {
        const existing = ratesMap.get(rate.property_id) || [];
        ratesMap.set(rate.property_id, [...existing, rate]);
      });

      setPropertyRates(ratesMap);
    } catch (error) {
      console.error('Error loading property rates:', error);
      
      // Retry logic for network errors
      if (retryCount < maxRetries && error instanceof TypeError && error.message.includes('fetch')) {
        console.log(`Retrying loadPropertyRates after network error (attempt ${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * (retryCount + 1)));
        return loadPropertyRates(retryCount + 1);
      }
      
      // After max retries or non-retryable error, show warning and use empty rates
      if (retryCount >= maxRetries) {
        console.warn('Failed to load property rates after retries, using empty rates');
        toast.error('Цены не загружены, попробуй позже');
      }
      setPropertyRates(new Map());
    }
  };

  const handleSaveMinStay = async (propertyId: string, date: string, minStay: number) => {
    if (minStay < 1) {
      toast.error('Минимальный срок должен быть не менее 1 дня');
      return;
    }

    setIsSavingMinStay(true);
    try {
      const property = properties.find(p => p.id === propertyId);
      if (!property) {
        toast.error('Объект не найден');
        return;
      }

      const rate = getRateForDate(propertyId, new Date(date));
      const rateRecord = {
        property_id: propertyId,
        date,
        daily_price: rate?.daily_price || property.base_price,
        min_stay: minStay,
        currency: rate?.currency || property.currency,
      };

      const { error } = await supabase
        .from('property_rates')
        .upsert(rateRecord, {
          onConflict: 'property_id,date',
        });

      if (error) throw error;

      // Refresh rates
      await loadPropertyRates();
      setMinStayPopoverOpen(null);
      toast.success('Минимальный срок обновлен');
    } catch (error) {
      console.error('Error saving min stay:', error);
      toast.error('Ошибка при сохранении минимального срока');
    } finally {
      setIsSavingMinStay(false);
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
    const today = new Date();
    const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const centerOffset = Math.floor(60 / 2);
    const newStartDate = new Date(localToday);
    newStartDate.setDate(newStartDate.getDate() - centerOffset);

    setCurrentDate(newStartDate);

    // Even if currentDateTimestamp doesn't change (same start date), we still want to scroll.
    // Otherwise "Сегодня" appears to do nothing.
    const targetScrollLeft = Math.max(0, (centerOffset - DAYS_BEFORE_TODAY_VISIBLE) * CELL_WIDTH);
    requestAnimationFrame(() => {
      const sc = scrollContainerRef.current;
      if (sc) sc.scrollTo({ left: targetScrollLeft, behavior: 'auto' });
    });
  };

  const goToDate = (targetDate: Date) => {
    const localDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

    const centerOffset = Math.floor(60 / 2);
    const newStartDate = new Date(localDate);
    newStartDate.setDate(newStartDate.getDate() - centerOffset);

    setCurrentDate(newStartDate);
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
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const start = new Date(checkIn);
    const localStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const end = new Date(checkOut);
    const localEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return d >= localStart && d < localEnd;
  };

  const getBookingStartCol = (booking: Booking) => {
    const start = new Date(booking.check_in);
    const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const first = new Date(dates[0]);
    const firstDate = new Date(first.getFullYear(), first.getMonth(), first.getDate());

    if (startDate < firstDate) return 0;

    const diffTime = startDate.getTime() - firstDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const isBookingStartTruncated = (booking: Booking) => {
    const start = new Date(booking.check_in);
    const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const first = new Date(dates[0]);
    const firstDate = new Date(first.getFullYear(), first.getMonth(), first.getDate());
    return startDate < firstDate;
  };

  const isBookingEndTruncated = (booking: Booking) => {
    const end = new Date(booking.check_out);
    const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const last = new Date(dates[dates.length - 1]);
    const lastDate = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    return endDate > lastDate;
  };

  const getHiddenDaysAtStart = (booking: Booking) => {
    const start = new Date(booking.check_in);
    const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const first = new Date(dates[0]);
    const firstDate = new Date(first.getFullYear(), first.getMonth(), first.getDate());
    
    if (startDate >= firstDate) return 0;
    
    const diffTime = firstDate.getTime() - startDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const getBookingSpan = (booking: Booking) => {
    const checkIn = new Date(booking.check_in);
    const start = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate());
    const checkOut = new Date(booking.check_out);
    const end = new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate());
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
    // Используем локальную дату без времени для корректной работы
    const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dateString = format(localDate, 'yyyy-MM-dd');

    if (!dateSelection.startDate || dateSelection.propertyId !== propertyId) {
      setDateSelection({
        propertyId,
        startDate: dateString,
        endDate: null,
      });
    } else if (dateSelection.startDate && !dateSelection.endDate) {
      const start = parseISO(dateSelection.startDate);
      const end = localDate;

      if (isBefore(end, start) || isSameDay(end, start)) {
        // Если выбранная дата раньше или равна начальной, делаем её новой начальной
        setDateSelection({
          propertyId,
          startDate: dateString,
          endDate: null,
        });
      } else {
        // Обе даты выбраны - сразу открываем форму бронирования
        setDateSelection({
          propertyId,
          startDate: dateSelection.startDate,
          endDate: dateString,
        });

        // check_out должен быть exclusive - добавляем 1 день к последней выбранной дате
        const checkOutDate = addDays(end, 1);
        const checkOutString = format(checkOutDate, 'yyyy-MM-dd');

        onAddReservation(propertyId, dateSelection.startDate, checkOutString);
      }
    }
  };

  const handleCloseConditionsModal = () => {
    setShowConditionsModal(false);
    setConditionsModalData(null);
    resetDateSelection();
  };

  const resetDateSelection = () => {
    setDateSelection({
      propertyId: '',
      startDate: null,
      endDate: null,
    });
    onDateSelectionReset?.();
  };

  // Expose resetDateSelection to parent via window
  useEffect(() => {
    if (onDateSelectionReset) {
      (window as Window & { __calendarResetDateSelection?: () => void }).__calendarResetDateSelection = resetDateSelection;
    }
    return () => {
      delete (window as Window & { __calendarResetDateSelection?: () => void }).__calendarResetDateSelection;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getRateForDate = (propertyId: string, date: Date): PropertyRate | null => {
    const rates = propertyRates.get(propertyId) || [];
    const dateString = date.toISOString().split('T')[0];
    return rates.find((r) => r.date === dateString) || null;
  };

  const isCellOccupied = (propertyId: string, date: Date): boolean => {
    return bookings.some(b => b.property_id === propertyId && isDateInRange(date, b.check_in, b.check_out));
  };

  // Плоский список объектов (группы удалены)
  const sortedProperties = useMemo(() => {
    return [...properties].sort((a, b) => {
      const aSort = typeof a.sort_order === 'number' ? a.sort_order : Number.MAX_SAFE_INTEGER;
      const bSort = typeof b.sort_order === 'number' ? b.sort_order : Number.MAX_SAFE_INTEGER;
      if (aSort !== bSort) return aSort - bSort;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [properties]);

  // Обработка drag & drop для групп и объектов
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Группы удалены: плоский reorder объектов
      await handlePropertyReorder(activeId, overId);

    // Обновляем список properties через callback
    if (onPropertiesUpdate && properties.length > 0) {
      try {
        // Сначала пытаемся загрузить без сортировки, чтобы избежать ошибки PGRST204
        const { data, error } = await supabase
        .from('properties')
        .select('*')
          .in('id', properties.map(p => p.id));
        
        if (error) {
          console.error('Error loading properties:', error);
          return;
        }
      
      if (data) {
          // Сортируем вручную: сначала по sort_order (если есть), потом по created_at
          const sorted = data.sort((a, b) => {
            const aSort = ('sort_order' in a && typeof a.sort_order === 'number') ? a.sort_order : Number.MAX_SAFE_INTEGER;
            const bSort = ('sort_order' in b && typeof b.sort_order === 'number') ? b.sort_order : Number.MAX_SAFE_INTEGER;
            if (aSort !== bSort) {
              return aSort - bSort;
            }
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          });
          onPropertiesUpdate(sorted);
        }
      } catch (err) {
        console.error('Error in onPropertiesUpdate:', err);
      }
    }
  };

  const handlePropertyReorder = async (activeId: string, overId: string) => {
    const activeIndex = sortedProperties.findIndex(p => p.id === activeId);
    const overIndex = sortedProperties.findIndex(p => p.id === overId);
      if (activeIndex === -1 || overIndex === -1) return;

    const reordered = arrayMove(sortedProperties, activeIndex, overIndex);
      
      for (let i = 0; i < reordered.length; i++) {
      try {
        const { error } = await supabase
          .from('properties')
          .update({ sort_order: i })
          .eq('id', reordered[i].id);

        if (error) {
          if (error.code === 'PGRST204' || error.message?.includes("Could not find the 'sort_order' column")) {
            console.warn(`sort_order column not found, skipping update for property ${reordered[i].id}`);
          } else {
            console.error(`Error updating sort_order for property ${reordered[i].id}:`, error);
          }
        }
      } catch (err) {
        console.warn(`Failed to update sort_order for property ${reordered[i].id}:`, err);
      }
    }
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
          <button
            onClick={() => {
              setConditionsModalData({
                propertyId: properties[0]?.id || '',
                startDate: new Date().toISOString().split('T')[0],
                endDate: new Date().toISOString().split('T')[0],
                price: properties[0]?.base_price || 0,
                minStay: properties[0]?.minimum_booking_days || 1,
                currency: properties[0]?.currency || 'RUB',
              });
              setShowConditionsModal(true);
            }}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Изменить условия
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <CalendarHeader
          currentDate={visibleDate}
          onPrevMonth={goToPrevMonth}
          onNextMonth={goToNextMonth}
          onPrevWeek={goToPrevWeek}
          onNextWeek={goToNextWeek}
          onToday={goToToday}
          onDateSelect={goToDate}
        />

        <div className="flex-1 flex flex-col overflow-hidden" ref={calendarRef}>
          {/* ВАЖНО: overflow-auto позволяет прокручивать даты, но объекты должны оставаться видимыми */}
          <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
            {/* Dates header row: lives inside the same scroll container as the grid to avoid scroll-sync lag */}
            <div className="flex border-b border-slate-700 bg-slate-800 sticky top-0 z-20 min-w-max">
              <div className="w-64 flex-shrink-0 sticky left-0 z-30 border-r border-slate-700 bg-slate-800">
              <div className="h-14 flex items-center justify-center">
                <span className="text-sm text-slate-400">Объекты</span>
              </div>
            </div>
              <div className="flex" style={{ width: `${dates.length * CELL_WIDTH}px` }}>
                {dates.map((date, i) => {
                  const today = new Date();
                  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                  const isToday = checkDate.getTime() === localToday.getTime();

                  return (
                    <div
                      key={i}
                      className={`w-16 flex-shrink-0 border-r border-slate-700 ${
                        isToday ? 'bg-teal-500/10' : ''
                      }`}
                    >
                      <div className="px-2 py-2 text-center">
                        <div className={`text-sm font-medium ${isToday ? 'text-teal-400' : 'text-slate-300'}`}>
                          {date.getDate()}
                        </div>
                        <div className={`text-xs ${isToday ? 'text-teal-400' : 'text-slate-400'}`}>
                          {date.toLocaleDateString('ru-RU', { weekday: 'short' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortedProperties.map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {/* ВАЖНО: relative позиционирование для корректного отображения объектов при прокрутке */}
                <div className="relative" style={{ minHeight: '100%' }}>
                  {sortedProperties.map((property) => {
                    console.log('Rendering property:', { 
                      propertyId: property.id, 
                      propertyName: property.name 
                    });
                    
                    try {
                              const propFirst = new Date(dates[0]);
                              const propFirstVisibleDate = new Date(propFirst.getFullYear(), propFirst.getMonth(), propFirst.getDate(), 0, 0, 0, 0);
                              const propLast = new Date(dates[dates.length - 1]);
                              const propLastVisibleDate = new Date(propLast.getFullYear(), propLast.getMonth(), propLast.getDate(), 23, 59, 59, 999);

                              const propBookings = bookings.filter((b) => {
                                if (b.property_id !== property.id) return false;

                                const checkInDate = new Date(b.check_in);
                                const checkIn = new Date(checkInDate.getFullYear(), checkInDate.getMonth(), checkInDate.getDate());
                                const checkOutDate = new Date(b.check_out);
                                const checkOut = new Date(checkOutDate.getFullYear(), checkOutDate.getMonth(), checkOutDate.getDate());

                                return checkOut > propFirstVisibleDate && checkIn <= propLastVisibleDate;
                              });

                              const isExpanded = expandedProperties.has(property.id);
                              const bookingLayers = getBookingLayers(propBookings);
                              const rowHeight = Math.max(44, bookingLayers.length * 32 + 16);
                              const collapsedHeight = 48;
                              const totalRowHeight = isExpanded ? 32 + rowHeight : collapsedHeight;

                              return (
                                <SortablePropertyRow
                                  key={property.id}
                                  property={property}
                                  isExpanded={isExpanded}
                                  onToggle={() => togglePropertyExpansion(property.id)}
                                  totalRowHeight={totalRowHeight}
                                >
                                  <div 
                                    className="flex-shrink-0"
                                    // Keep grid width aligned with header. Adding +256px here causes a 4-day (256px) visual offset.
                                    style={{ width: `${dates.length * CELL_WIDTH}px`, height: `${totalRowHeight}px`, minWidth: `${dates.length * CELL_WIDTH}px` }}
                                  >
                                    {isExpanded ? (
                        <div className="flex flex-col h-full">
                          <div className="border-b border-slate-700/30 bg-slate-800/50">
                            <div className="h-8 flex">
                              {dates.map((date, i) => {
                                const rate = getRateForDate(property.id, date);
                                const displayMinStay = rate?.min_stay || property.minimum_booking_days;
                                const dateString = date.toISOString().split('T')[0];
                                const isPopoverOpen = minStayPopoverOpen?.propertyId === property.id && minStayPopoverOpen?.date === dateString;

                                return (
                                  <Popover
                                    key={i}
                                    open={isPopoverOpen}
                                    onOpenChange={(open) => {
                                      if (open) {
                                        setMinStayPopoverOpen({ propertyId: property.id, date: dateString });
                                        setMinStayValue(displayMinStay);
                                      } else {
                                        setMinStayPopoverOpen(null);
                                      }
                                    }}
                                    content={
                                      <div className="p-2 space-y-2 min-w-[200px]">
                                        <div className="text-sm text-white mb-2">Минимальный срок бронирования</div>
                                        <InputNumber
                                          value={minStayValue}
                                          onChange={(value) => setMinStayValue(value || 1)}
                                          min={1}
                                          className="w-full"
                                          autoFocus
                                        />
                                        <div className="flex gap-2 justify-end">
                                          <Button
                                            size="small"
                                            onClick={() => setMinStayPopoverOpen(null)}
                                          >
                                            Отмена
                                          </Button>
                                          <Button
                                            type="primary"
                                            size="small"
                                            loading={isSavingMinStay}
                                            onClick={() => handleSaveMinStay(property.id, dateString, minStayValue)}
                                          >
                                            Сохранить
                                          </Button>
                                        </div>
                                      </div>
                                    }
                                    trigger="click"
                                    placement="bottom"
                                  >
                                    <div
                                      className="w-16 flex-shrink-0 border-r border-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-700/50 transition-colors"
                                    >
                                      <div className="text-[10px] font-medium text-slate-300 tabular-nums">
                                        {displayMinStay}
                                      </div>
                                    </div>
                                  </Popover>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex-1 border-b border-slate-700">
                            <div className="relative h-full" style={{ minHeight: `${rowHeight}px` }}>
                              <div className="absolute inset-0 flex">
                                {dates.map((date, i) => {
                                  const dateString = date.toISOString().split('T')[0];
                                  const today = new Date();
                                  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                                  const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                                  const isToday = checkDate.getTime() === localToday.getTime();
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
                                  const displayPrice = Math.round(rate?.daily_price || property.base_price);
                                  const isDragOverThisCell = dragOverDates.has(dateString) && dragOverCell?.propertyId === property.id;
                                  const dragOverColor = isDragValid ? 'bg-green-500/30' : 'bg-red-500/30';

                                  return (
                                    <div
                                      key={i}
                                      className={`w-16 flex-shrink-0 border-r border-slate-700/50 cursor-pointer transition-colors ${
                                        isToday ? 'bg-teal-500/10' : ''
                                      } ${isSelected ? 'bg-teal-500/20' : ''
                                      } ${isInRange ? 'bg-blue-500/10' : ''} ${isDragOverThisCell ? dragOverColor : ''} ${!isOccupied ? 'hover:bg-slate-800/30' : ''}`}
                                      onClick={() => !isOccupied && handleCellClick(property.id, date)}
                                    >
                                      {!isOccupied && (
                                        <div className="h-11 flex items-center justify-center text-center px-1">
                                          <div className="text-[10px] font-medium text-slate-300 tabular-nums truncate">
                                            {displayPrice}
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
                                  const fullSpan = getBookingSpan(booking);
                                  const hiddenDaysAtStart = getHiddenDaysAtStart(booking);
                                  const visibleSpan = fullSpan - hiddenDaysAtStart;

                                  // Используем dates.length вместо daysToShow для правильного отображения всех бронирований
                                  if (startCol < 0 || startCol >= dates.length) return null;

                                  const isStartTruncated = isBookingStartTruncated(booking);
                                  const isEndTruncated = isBookingEndTruncated(booking);

                                  return (
                                    <BookingBlock
                                      key={booking.id}
                                      booking={booking}
                                      startCol={startCol}
                                      span={Math.min(visibleSpan, dates.length - startCol)}
                                      layerIndex={layerIndex}
                                      cellWidth={CELL_WIDTH}
                                      onClick={() => onEditReservation(booking)}
                                      onDragStart={(b) => setDragState({ booking: b, originalPropertyId: property.id })}
                                      onDragEnd={() => setDragState({ booking: null, originalPropertyId: null })}
                                      isDragging={dragState.booking?.id === booking.id}
                                      isStartTruncated={isStartTruncated}
                                      isEndTruncated={isEndTruncated}
                                    />
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        // Collapsed состояние - пустая строка, но видимая
                        <div className="h-full bg-slate-800/50 border-b border-slate-700" />
                      )}
                                  </div>
                                </SortablePropertyRow>
                              );
                    } catch (error) {
                      console.error('Error rendering property:', property.id, error);
                      return (
                        <div key={property.id} className="p-4 bg-red-900/20 text-red-400">
                          Ошибка отображения объекта: {property.name}
                      </div>
                    );
                    }
                  })}

                  {properties.length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-slate-400">
                        Нет объектов. Добавьте первый объект для начала работы.
                      </p>
                    </div>
                  )}
                </div>
              </SortableContext>
              
              <DragOverlay>
                {activeId ? (
                  <div className="bg-slate-700 p-2 rounded shadow-lg">
                    {properties.find(p => p.id === activeId)?.name || 
                     'Перетаскивание'}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      </div>

      {showConditionsModal && conditionsModalData && (
        <ChangeConditionsModal
          isOpen={showConditionsModal}
          onClose={handleCloseConditionsModal}
          onSuccess={loadPropertyRates}
          propertyId={conditionsModalData.propertyId}
          startDate={conditionsModalData.startDate}
          endDate={conditionsModalData.endDate}
          currentPrice={conditionsModalData.price}
          currentMinStay={conditionsModalData.minStay}
          currency={conditionsModalData.currency}
          properties={properties}
        />
      )}

      {/* Группы объявлений удалены */}
    </div>
  );
}
