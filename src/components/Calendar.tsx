import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Settings, ChevronDown, ChevronRight, Home } from 'lucide-react';
import toast from 'react-hot-toast';
import { Property, Booking, PropertyRate, PropertyGroup, supabase } from '../lib/supabase';
import { CalendarHeader } from './CalendarHeader';
import { BookingBlock } from './BookingBlock';
import { ChangeConditionsModal } from './ChangeConditionsModal';
import { PropertyGroupHeader } from './PropertyGroupHeader';
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

type GroupedProperties = {
  group: PropertyGroup | null; // null для объектов без группы
  properties: Property[];
};

export function Calendar({
  properties,
  bookings,
  onAddReservation,
  onEditReservation,
  onBookingUpdate,
  onPropertiesUpdate,
}: CalendarProps) {
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [propertyGroups, setPropertyGroups] = useState<PropertyGroup[]>([]);
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
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const calendarRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const seenPropertyIds = useRef<Set<string>>(new Set());

  const CELL_WIDTH = 64;

  const currentDateTimestamp = currentDate.getTime();
  
  const dates = useMemo(() => {
    return Array.from({ length: daysToShow }, (_, i) => {
      const date = new Date(currentDateTimestamp);
      date.setDate(date.getDate() + i);
      return date;
    });
  }, [currentDateTimestamp, daysToShow]);

  const centerDate = useMemo(() => {
    return dates[Math.floor(daysToShow / 2)] || new Date(currentDateTimestamp);
  }, [dates, daysToShow, currentDateTimestamp]);

  const [visibleDate, setVisibleDate] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  });
  const [headerScrollLeft, setHeaderScrollLeft] = useState(0);
  
  const initialScrollDone = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Загрузка групп объектов
  useEffect(() => {
    loadPropertyGroups();
  }, []);

  useEffect(() => {
    loadPropertyRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties]);

  const loadPropertyGroups = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('property_groups')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });

      if (error) {
        // Если таблица не существует (миграция не применена), просто работаем без групп
        if (error.code === 'PGRST205' || 
            error.code === '42P01' || 
            error.message?.includes('Could not find the table') ||
            error.message?.includes('relation') ||
            error.message?.includes('does not exist')) {
          console.warn('Property groups table not found - working without groups. Apply migration to enable grouping.');
          setPropertyGroups([]);
          return;
        }
        // Для других ошибок тоже работаем без групп (fallback)
        console.warn('Error loading property groups, working without groups:', error);
        setPropertyGroups([]);
        return;
      }
      
      setPropertyGroups(data || []);
      
      // Разворачиваем все группы по умолчанию
      if (data) {
        setExpandedGroups(new Set(data.map(g => g.id)));
      }
    } catch (error) {
      // Не логируем ошибку, если таблица просто не существует
      const errorObj = error as { code?: string; message?: string };
      if (errorObj?.code === 'PGRST205' || errorObj?.message?.includes('Could not find the table')) {
        console.warn('Property groups table not found - working without groups. Apply migration to enable grouping.');
      } else {
        console.error('Error loading property groups:', error);
      }
      // Не падаем, просто работаем без групп
      setPropertyGroups([]);
    }
  };

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

  // При изменении текущей базовой даты центрируем скролл и обновляем "видимую" дату
  useEffect(() => {
    const centerOffset = Math.floor(60 / 2);
    const scrollLeft = centerOffset * CELL_WIDTH;

    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTo({ left: scrollLeft, behavior: 'auto' });
    }

    setHeaderScrollLeft(scrollLeft);
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
      
      setHeaderScrollLeft(scrollLeft);
      
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

        const endPlusOne = new Date(end);
        endPlusOne.setDate(endPlusOne.getDate() + 1);
        const checkOutString = endPlusOne.toISOString().split('T')[0];

        onAddReservation(propertyId, dateSelection.startDate, checkOutString);
      }
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

  // Группировка properties по группам
  const groupedProperties = useMemo(() => {
    const grouped: GroupedProperties[] = [];
    const groupsMap = new Map<string, PropertyGroup>();
    
    propertyGroups.forEach(group => {
      groupsMap.set(group.id, group);
    });

    // Создаем записи для каждой группы
    const sortedGroups = [...propertyGroups].sort((a, b) => a.sort_order - b.sort_order);
    sortedGroups.forEach(group => {
      const groupProperties = properties
        .filter(p => p.group_id === group.id)
        .sort((a, b) => a.sort_order - b.sort_order);
      
      if (groupProperties.length > 0) {
        grouped.push({ group, properties: groupProperties });
      }
    });

    // Добавляем объекты без группы
    const ungroupedProperties = properties
      .filter(p => !p.group_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    
    if (ungroupedProperties.length > 0) {
      grouped.push({ group: null, properties: ungroupedProperties });
    }

    return grouped;
  }, [properties, propertyGroups]);

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

    // Определяем, что перетаскиваем: группу или объект
    const isGroup = propertyGroups.some(g => g.id === activeId);
    const isOverGroup = propertyGroups.some(g => g.id === overId);

    if (isGroup && isOverGroup) {
      // Перемещение группы
      await handleGroupReorder(activeId, overId);
    } else if (!isGroup && !isOverGroup) {
      // Перемещение объекта внутри/между группами
      await handlePropertyReorder(activeId, overId);
    } else if (!isGroup && isOverGroup) {
      // Перемещение объекта в группу
      await handlePropertyMoveToGroup(activeId, overId);
    }

    // Обновляем список properties через callback
    if (onPropertiesUpdate) {
      const { data } = await supabase
        .from('properties')
        .select('*')
        .in('id', properties.map(p => p.id))
        .order('sort_order', { ascending: true });
      
      if (data) {
        onPropertiesUpdate(data);
      }
    }
  };

  const handleGroupReorder = async (activeId: string, overId: string) => {
    const activeIndex = propertyGroups.findIndex(g => g.id === activeId);
    const overIndex = propertyGroups.findIndex(g => g.id === overId);

    if (activeIndex === -1 || overIndex === -1) return;

    const newGroups = arrayMove(propertyGroups, activeIndex, overIndex);
    
    // Обновляем sort_order в БД
    const updates = newGroups.map((group, index) => ({
      id: group.id,
      sort_order: index,
    }));

    for (const update of updates) {
      await supabase
        .from('property_groups')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id);
    }

    setPropertyGroups(newGroups);
  };

  const handlePropertyReorder = async (activeId: string, overId: string) => {
    const activeProperty = properties.find(p => p.id === activeId);
    const overProperty = properties.find(p => p.id === overId);

    if (!activeProperty || !overProperty) return;

    // Если объекты в одной группе (или оба без группы)
    if (activeProperty.group_id === overProperty.group_id) {
      const sameGroupProperties = properties
        .filter(p => p.group_id === activeProperty.group_id)
        .sort((a, b) => a.sort_order - b.sort_order);

      const activeIndex = sameGroupProperties.findIndex(p => p.id === activeId);
      const overIndex = sameGroupProperties.findIndex(p => p.id === overId);

      if (activeIndex === -1 || overIndex === -1) return;

      const reordered = arrayMove(sameGroupProperties, activeIndex, overIndex);
      
      // Обновляем sort_order в БД
      for (let i = 0; i < reordered.length; i++) {
        await supabase
          .from('properties')
          .update({ sort_order: i })
          .eq('id', reordered[i].id);
      }
    } else {
      // Перемещение между группами - меняем group_id и sort_order
      const targetGroupProperties = properties
        .filter(p => p.group_id === overProperty.group_id)
        .sort((a, b) => a.sort_order - b.sort_order);

      const overIndex = targetGroupProperties.findIndex(p => p.id === overId);
      
      // Обновляем активный объект
      await supabase
        .from('properties')
        .update({
          group_id: overProperty.group_id,
          sort_order: overIndex,
        })
        .eq('id', activeId);

      // Обновляем sort_order для остальных объектов в целевой группе
      for (let i = 0; i < targetGroupProperties.length; i++) {
        if (targetGroupProperties[i].id !== overId) {
          await supabase
            .from('properties')
            .update({ sort_order: i >= overIndex ? i + 1 : i })
            .eq('id', targetGroupProperties[i].id);
        }
      }
    }
  };

  const handlePropertyMoveToGroup = async (propertyId: string, groupId: string) => {
    const targetGroupProperties = properties
      .filter(p => p.group_id === groupId)
      .sort((a, b) => a.sort_order - b.sort_order);

    await supabase
      .from('properties')
      .update({
        group_id: groupId,
        sort_order: targetGroupProperties.length,
      })
      .eq('id', propertyId);
  };

  const toggleGroupExpansion = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const maxSortOrder = propertyGroups.length > 0 
        ? Math.max(...propertyGroups.map(g => g.sort_order))
        : -1;

      const { data, error } = await supabase
        .from('property_groups')
        .insert({
          name: newGroupName.trim(),
          user_id: user.id,
          sort_order: maxSortOrder + 1,
        })
        .select()
        .single();

      if (error) throw error;

      setPropertyGroups([...propertyGroups, data]);
      setExpandedGroups(prev => new Set([...prev, data.id]));
      setShowNewGroupModal(false);
      setNewGroupName('');
    } catch (error) {
      console.error('Error creating group:', error);
      alert('Ошибка создания группы');
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
      <div className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewGroupModal(true)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Новая группа
          </button>
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
          <div className="flex border-b border-slate-700 bg-slate-800 sticky top-0 z-20">
            <div className="w-64 flex-shrink-0 border-r border-slate-700 bg-slate-800">
              <div className="h-14 flex items-center justify-center">
                <span className="text-sm text-slate-400">Объекты</span>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <div 
                className="flex" 
                style={{ 
                  transform: `translateX(-${headerScrollLeft}px)`,
                  width: `${dates.length * CELL_WIDTH}px`
                }}
              >
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
          </div>

          <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={[...propertyGroups.map(g => g.id), ...properties.map(p => p.id)]}
                strategy={verticalListSortingStrategy}
              >
                <div className="relative">
                  {groupedProperties.map((grouped) => {
                    const groupId = grouped.group?.id || 'ungrouped';
                    const isGroupExpanded = grouped.group ? expandedGroups.has(groupId) : true;
                    
                    return (
                      <div key={groupId} className="border-b border-slate-700">
                        {grouped.group ? (
                          <PropertyGroupHeader
                            group={grouped.group}
                            isExpanded={isGroupExpanded}
                            onToggle={() => toggleGroupExpansion(groupId)}
                            onEdit={() => {
                              // TODO: Реализовать редактирование группы
                              if (grouped.group) {
                                console.log('Edit group', grouped.group);
                              }
                            }}
                            onDelete={async () => {
                              // TODO: Реализовать удаление группы
                              if (!grouped.group) return;
                              
                              if (confirm(`Удалить группу "${grouped.group.name}"? Объекты будут перемещены в "Без группы".`)) {
                                const groupId = grouped.group.id;
                                await supabase
                                  .from('properties')
                                  .update({ group_id: null })
                                  .eq('group_id', groupId);
                                
                                await supabase
                                  .from('property_groups')
                                  .delete()
                                  .eq('id', groupId);
                                
                                await loadPropertyGroups();
                              }
                            }}
                            propertiesCount={grouped.properties.length}
                          />
                        ) : (
                          // Header for ungrouped properties
                          <div className="bg-slate-600 text-white border-b border-slate-700 flex items-center px-4 gap-2 h-12 sticky top-0 z-40">
                            <button
                              onClick={() => toggleGroupExpansion(groupId)}
                              className="flex-shrink-0 text-slate-300 hover:text-white transition-colors"
                            >
                              {isGroupExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                            <Home className="w-4 h-4 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium leading-tight truncate">
                                Без группы
                              </div>
                              <div className="text-xs text-slate-300">
                                {grouped.properties.length} {grouped.properties.length === 1 ? 'объект' : 'объектов'}
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {isGroupExpanded && (
                          <div>
                            {grouped.properties.map((property) => {
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
                                  groups={propertyGroups}
                                  onMoveToGroup={async (propertyId, groupId) => {
                                    const targetGroupProperties = properties
                                      .filter(p => p.group_id === groupId)
                                      .sort((a, b) => a.sort_order - b.sort_order);

                                    await supabase
                                      .from('properties')
                                      .update({
                                        group_id: groupId,
                                        sort_order: groupId ? targetGroupProperties.length : property.sort_order,
                                      })
                                      .eq('id', propertyId);

                                    if (onPropertiesUpdate) {
                                      const { data } = await supabase
                                        .from('properties')
                                        .select('*')
                                        .in('id', properties.map(p => p.id))
                                        .order('sort_order', { ascending: true });
                                      
                                      if (data) {
                                        onPropertiesUpdate(data);
                                      }
                                    }
                                  }}
                                >
                                  <div 
                                    className="flex-shrink-0"
                                    style={{ width: `${dates.length * CELL_WIDTH}px`, height: `${totalRowHeight}px`, minWidth: `${256 + dates.length * CELL_WIDTH}px` }}
                                  >
                                    {isExpanded ? (
                        <div className="flex flex-col h-full">
                          <div className="border-b border-slate-700/30 bg-slate-800/50">
                            <div className="h-8 flex">
                              {dates.map((date, i) => {
                                const rate = getRateForDate(property.id, date);
                                const displayMinStay = rate?.min_stay || property.minimum_booking_days;
                                const dateString = date.toISOString().split('T')[0];
                                const displayPrice = rate?.daily_price || property.base_price;

                                return (
                                  <div
                                    key={i}
                                    className="w-16 flex-shrink-0 border-r border-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-700/50 transition-colors"
                                    onClick={() => {
                                      setConditionsModalData({
                                        propertyId: property.id,
                                        startDate: dateString,
                                        endDate: dateString,
                                        price: displayPrice,
                                        minStay: displayMinStay,
                                        currency: property.currency,
                                      });
                                      setShowConditionsModal(true);
                                    }}
                                  >
                                    <div className="text-[10px] font-medium text-slate-500">
                                      {displayMinStay}
                                    </div>
                                  </div>
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
                                  const displayPrice = rate?.daily_price || property.base_price;
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
                                          <div className="text-[10px] font-medium text-slate-400 truncate">
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

                                  if (startCol < 0 || startCol >= daysToShow) return null;

                                  const isStartTruncated = isBookingStartTruncated(booking);
                                  const isEndTruncated = isBookingEndTruncated(booking);

                                  return (
                                    <BookingBlock
                                      key={booking.id}
                                      booking={booking}
                                      startCol={startCol}
                                      span={Math.min(visibleSpan, daysToShow - startCol)}
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
                            })}
                          </div>
                        )}
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
              </SortableContext>
              
              <DragOverlay>
                {activeId ? (
                  <div className="bg-slate-700 p-2 rounded shadow-lg">
                    {propertyGroups.find(g => g.id === activeId)?.name || 
                     properties.find(p => p.id === activeId)?.name || 
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

      {showNewGroupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-96">
            <h2 className="text-xl font-semibold text-white mb-4">Новая группа</h2>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateGroup();
                } else if (e.key === 'Escape') {
                  setShowNewGroupModal(false);
                  setNewGroupName('');
                }
              }}
              placeholder="Название группы"
              className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowNewGroupModal(false);
                  setNewGroupName('');
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateGroup}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
