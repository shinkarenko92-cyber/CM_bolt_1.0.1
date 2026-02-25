/**
 * Календарь: горизонтальный CalendarList, бары броней по комнатам (property),
 * выбранная дата → FlatList баров + Standard rate, FAB → AddBookingModal.
 * Realtime подписка на bookings.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarList } from 'react-native-calendars';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { supabase, type Property, type BookingWithProperty } from '../lib/supabase';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AddBookingModal } from './AddBookingModal';
import { BulkEditModal } from '../components/BulkEditModal';

async function fetchProperties(): Promise<Property[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchBookings(): Promise<BookingWithProperty[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('*, properties(name)')
    .order('check_in', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BookingWithProperty[];
}

/** Цвет бара по статусу: booked=red, pending=yellow, available=green */
function statusToBarColor(status: string, textSecondary: string): string {
  if (status === 'confirmed') return '#EF4444';
  if (status === 'pending') return '#F59E0B';
  if (status === 'cancelled') return textSecondary;
  return '#10B981';
}

/** Брони, пересекающие дату dateStr (YYYY-MM-DD) */
function getBookingsForDate(bookings: BookingWithProperty[], dateStr: string): BookingWithProperty[] {
  return bookings.filter((b) => {
    const ci = b.check_in.split('T')[0];
    const co = b.check_out.split('T')[0];
    return ci <= dateStr && co > dateStr;
  });
}

/** Приоритет статуса для цвета точки: booked > pending > available */
function statusPriority(status: string): number {
  if (status === 'confirmed') return 3; // red
  if (status === 'pending') return 2;  // yellow
  if (status === 'cancelled') return 0;
  return 1; // available/green
}

/** Даты для markedDates: цвет точки по «максимальному» статусу в этот день (booked=red, pending=yellow, иначе green) */
function getMarkedDatesFromBookings(bookings: BookingWithProperty[]): Record<string, { marked?: boolean; dotColor?: string }> {
  const byDate = new Map<string, number>();
  for (const b of bookings) {
    const ci = b.check_in.split('T')[0];
    const co = b.check_out.split('T')[0];
    const start = new Date(ci + 'T12:00:00').getTime();
    const end = new Date(co + 'T12:00:00').getTime();
    const pri = statusPriority(b.status);
    for (let t = start; t < end; t += 86400000) {
      const d = new Date(t);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      if ((byDate.get(key) ?? 0) < pri) byDate.set(key, pri);
    }
  }
  const out: Record<string, { marked?: boolean; dotColor?: string }> = {};
  byDate.forEach((pri, d) => {
    const dotColor = pri === 3 ? '#EF4444' : pri === 2 ? '#F59E0B' : '#10B981';
    out[d] = { marked: true, dotColor };
  });
  return out;
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return `${days[d.getDay()]}, ${d.getDate()} ${formatMonthShort(d.getMonth())}`;
}

function formatMonthShort(month: number): string {
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return months[month] ?? '';
}

type SectionData = {
  type: 'property_header';
  property: Property;
} | {
  type: 'booking_bar';
  booking: BookingWithProperty;
  propertyName: string;
} | {
  type: 'available_bar';
  property: Property;
} | {
  type: 'rate_row';
  property: Property;
};

function buildSectionsForDate(
  dateStr: string,
  properties: Property[],
  bookings: BookingWithProperty[]
): SectionData[] {
  const items: SectionData[] = [];
  const bookingsOnDate = getBookingsForDate(bookings, dateStr);
  const byProperty = new Map<string, BookingWithProperty[]>();
  for (const b of bookingsOnDate) {
    const list = byProperty.get(b.property_id) ?? [];
    list.push(b);
    byProperty.set(b.property_id, list);
  }
  for (const prop of properties) {
    items.push({ type: 'property_header', property: prop });
    const propBookings = byProperty.get(prop.id) ?? [];
    if (propBookings.length === 0) {
      items.push({ type: 'available_bar', property: prop });
    } else {
      for (const b of propBookings) {
        items.push({
          type: 'booking_bar',
          booking: b,
          propertyName: (b as BookingWithProperty & { properties?: { name: string } }).properties?.name ?? prop.name,
        });
      }
    }
    items.push({ type: 'rate_row', property: prop });
  }
  return items;
}

function buildCalendarTheme(colors: import('../constants/theme').ThemeColors) {
  return {
    backgroundColor: colors.background,
    calendarBackground: colors.background,
    textSectionTitleColor: colors.textSecondary,
    selectedDayBackgroundColor: colors.primary,
    selectedDayTextColor: '#fff',
    todayTextColor: colors.primary,
    dayTextColor: colors.text,
    textDisabledColor: colors.input,
    dotColor: colors.primary,
    selectedDotColor: '#fff',
    arrowColor: colors.primary,
    monthTextColor: colors.text,
    textDayFontWeight: '500' as const,
    textMonthFontWeight: '700' as const,
  };
}

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function CalendarScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [selectedDate, setSelectedDate] = useState(getTodayString);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [bulkEditVisible, setBulkEditVisible] = useState(false);

  const calendarTheme = useMemo(() => buildCalendarTheme(colors), [colors]);

  const {
    data: properties = [],
    isLoading: loadingProperties,
    isError: errorProperties,
    refetch: refetchProperties,
    isRefetching,
  } = useQuery({ queryKey: ['properties'], queryFn: fetchProperties });

  const {
    data: bookings = [],
    isLoading: loadingBookings,
    isError: errorBookings,
    refetch: refetchBookings,
  } = useQuery({ queryKey: ['bookings'], queryFn: fetchBookings });

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const channel = client
      .channel('calendar-bookings-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['bookings'] });
        }
      )
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [queryClient]);

  const markedDates = useMemo(() => getMarkedDatesFromBookings(bookings), [bookings]);
  const sections = useMemo(
    () => buildSectionsForDate(selectedDate, properties, bookings),
    [selectedDate, properties, bookings]
  );

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['properties'] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
  }, [queryClient]);

  const renderItem = useCallback(
    ({ item }: { item: SectionData }) => {
      if (item.type === 'property_header') {
        return (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionHeaderText, { color: colors.text }]} numberOfLines={1}>
              {item.property.name}
            </Text>
          </View>
        );
      }
      if (item.type === 'booking_bar') {
        const color = statusToBarColor(item.booking.status, colors.textSecondary);
        return (
          <View style={[styles.bar, { backgroundColor: color }]}>
            <Text style={styles.barGuest} numberOfLines={1}>
              {item.booking.guest_name || '—'}
            </Text>
            <Text style={styles.barSub} numberOfLines={1}>
              {item.booking.check_in.split('T')[0]} — {item.booking.check_out.split('T')[0]}
            </Text>
          </View>
        );
      }
      if (item.type === 'available_bar') {
        return (
          <View style={[styles.bar, styles.availableBar]}>
            <Text style={styles.barGuestAvailable}>Свободно</Text>
          </View>
        );
      }
      if (item.type === 'rate_row') {
        return (
          <Pressable
            style={[styles.rateRow, { backgroundColor: colors.input }]}
            onPress={() => {}}
          >
            <Text style={[styles.rateLabel, { color: colors.textSecondary }]}>Standard rate</Text>
            <Text style={[styles.rateValue, { color: colors.text }]}>{item.property.base_price} {item.property.currency}</Text>
          </Pressable>
        );
      }
      return null;
    },
    [colors]
  );

  const isLoading = loadingProperties || loadingBookings;
  const isError = errorProperties || errorBookings;

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>Не удалось загрузить данные</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              refetchProperties();
              refetchBookings();
            }}
          >
            <Text style={styles.retryButtonText}>Повторить</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const firstPropertyName = properties[0]?.name ?? '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader
        title="Календарь"
        subtitle={firstPropertyName}
        onSearch={() => setBulkEditVisible(true)}
        onNotifications={() => {}}
      />
      <CalendarList
        current={selectedDate}
        onDayPress={(day) => setSelectedDate(day.dateString)}
        markedDates={{
          ...markedDates,
          [selectedDate]: {
            ...markedDates[selectedDate],
            selected: true,
            selectedColor: colors.primary,
            selectedTextColor: '#fff',
          },
        }}
        theme={calendarTheme}
        horizontal
        pagingEnabled
        calendarWidth={width}
        pastScrollRange={12}
        futureScrollRange={12}
        showScrollIndicator={false}
      />
      <View style={[styles.dayTitle, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <Text style={[styles.dayTitleText, { color: colors.text }]}>{formatDisplayDate(selectedDate)}</Text>
      </View>
      <FlatList
        data={sections}
        keyExtractor={(item, index) => {
          if (item.type === 'property_header') return `h-${item.property.id}`;
          if (item.type === 'booking_bar') return `b-${item.booking.id}`;
          if (item.type === 'available_bar') return `a-${item.property.id}`;
          if (item.type === 'rate_row') return `r-${item.property.id}`;
          return `s-${index}`;
        }}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          properties.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.text }]}>Нет объектов. Добавьте объекты в настройках.</Text>
          ) : null
        }
      />
      <Pressable
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.primary }, pressed && styles.fabPressed]}
        onPress={() => setAddModalVisible(true)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
      <AddBookingModal
        visible={addModalVisible}
        properties={properties}
        onClose={() => setAddModalVisible(false)}
        onSuccess={() => {
          setAddModalVisible(false);
          queryClient.invalidateQueries({ queryKey: ['bookings'] });
        }}
      />
      <BulkEditModal
        visible={bulkEditVisible}
        onClose={() => setBulkEditVisible(false)}
        onApply={() => setBulkEditVisible(false)}
      />
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dayTitle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  dayTitleText: {
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  sectionHeader: {
    marginTop: 16,
    marginBottom: 6,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '700',
  },
  bar: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  availableBar: {
    backgroundColor: '#10B981',
  },
  barGuest: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  barGuestAvailable: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  barSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  rateLabel: {
    fontSize: 13,
  },
  rateValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 24,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabPressed: {
    opacity: 0.9,
  },
});
