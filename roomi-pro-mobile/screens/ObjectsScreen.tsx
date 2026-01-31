/**
 * Объекты (Airbnb PMS стиль): календарь с period-разметкой, круговая аналитика
 * Arrival/Departure/Stay, список броней с цветной полосой по статусу, график total left,
 * счёты New/Modified/Cancelled, FAB "+". Выбранный день фильтрует список.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar } from 'react-native-calendars';
import { BarChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { supabase, type Booking } from '../lib/supabase';
import { colors, DEFAULT_CURRENCY } from '../constants/colors';

export type BookingWithProperty = Booking & {
  properties?: { name: string } | null;
};

async function fetchBookingsWithProperty(): Promise<BookingWithProperty[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('*, properties(name)')
    .order('check_in', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookingWithProperty[];
}

/** Все даты между start и end включительно (YYYY-MM-DD). */
function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const startStr = start.split('T')[0];
  const endStr = end.split('T')[0];
  const d = new Date(startStr);
  const endDate = new Date(endStr);
  while (d <= endDate) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function statusToColor(status: string): string {
  if (status === 'confirmed') return colors.successCalendar;
  if (status === 'pending') return colors.warningCalendar;
  if (status === 'cancelled') return colors.cancelled;
  return colors.border;
}

/** Period-разметка: startingDay/endingDay/color по статусу. Свободные даты без разметки (белые). */
function buildMarkedDatesPeriod(
  bookings: BookingWithProperty[]
): Record<string, { type: 'period'; startingDay?: boolean; endingDay?: boolean; color: string }> {
  const acc: Record<
    string,
    { type: 'period'; startingDay?: boolean; endingDay?: boolean; color: string }
  > = {};
  for (const b of bookings) {
    const startStr = b.check_in.split('T')[0];
    const endStr = b.check_out.split('T')[0];
    const color = statusToColor(b.status);
    const range = getDateRange(startStr, endStr);
    range.forEach((date, i) => {
      acc[date] = {
        type: 'period',
        startingDay: i === 0,
        endingDay: i === range.length - 1,
        color,
      };
    });
  }
  return acc;
}

/** Бронирования, пересекающиеся с месяцем YYYY-MM. */
function filterBookingsByMonth(
  bookings: BookingWithProperty[],
  month: string
): BookingWithProperty[] {
  const [y, m] = month.split('-').map(Number);
  const firstDay = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const lastDayStr = `${month}-${String(lastDay).padStart(2, '0')}`;
  return bookings.filter((b) => {
    const checkIn = b.check_in.split('T')[0];
    const checkOut = b.check_out.split('T')[0];
    return (
      (checkIn >= firstDay && checkIn <= lastDayStr) ||
      (checkOut >= firstDay && checkOut <= lastDayStr) ||
      (checkIn <= firstDay && checkOut >= lastDayStr)
    );
  });
}

/** Бронирования, в которые попадает выбранный день. */
function filterBookingsByDate(
  bookings: BookingWithProperty[],
  date: string
): BookingWithProperty[] {
  return bookings.filter((b) => {
    const checkIn = b.check_in.split('T')[0];
    const checkOut = b.check_out.split('T')[0];
    return date >= checkIn && date <= checkOut;
  });
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Аналитика по месяцу. */
function useMonthAnalytics(
  bookings: BookingWithProperty[],
  currentMonth: string,
  selectedDate: string | null
) {
  return useMemo(() => {
    const byMonth = filterBookingsByMonth(bookings, currentMonth);
    const [y, m] = currentMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const midMonth = `${currentMonth}-${String(Math.min(15, lastDay)).padStart(2, '0')}`;
    const dayToUse = selectedDate && selectedDate.startsWith(currentMonth) ? selectedDate : midMonth;

    let arrivalsCount = 0;
    let departuresCount = 0;
    let staysCount = 0;
    for (const b of byMonth) {
      const checkIn = b.check_in.split('T')[0];
      const checkOut = b.check_out.split('T')[0];
      if (checkIn.startsWith(currentMonth)) arrivalsCount += 1;
      if (checkOut.startsWith(currentMonth)) departuresCount += 1;
      if (dayToUse >= checkIn && dayToUse <= checkOut) staysCount += 1;
    }

    const newCount = byMonth.filter((b) => b.created_at.startsWith(currentMonth)).length;
    const modifiedCount = byMonth.filter(
      (b) => b.updated_at.startsWith(currentMonth) && b.updated_at !== b.created_at
    ).length;
    const cancelledCount = byMonth.filter((b) => b.status === 'cancelled').length;

    const totalLeftSum = byMonth
      .filter((b) => b.status === 'confirmed')
      .reduce((sum, b) => sum + (b.total_price ?? 0), 0);

    return {
      arrivalsCount,
      departuresCount,
      staysCount,
      newCount,
      modifiedCount,
      cancelledCount,
      totalLeftSum,
      bookingsInMonth: byMonth,
    };
  }, [bookings, currentMonth, selectedDate]);
}

function BookingCard({
  item,
  currency,
}: {
  item: BookingWithProperty;
  currency: string;
}) {
  const checkIn = item.check_in.split('T')[0];
  const checkOut = item.check_out.split('T')[0];
  const propertyName = item.properties?.name ?? '—';
  const price = item.total_price != null ? item.total_price : 0;
  const curr = item.currency || currency;
  return (
    <View style={styles.bookingCard}>
      <View style={[styles.bookingStrip, { backgroundColor: statusToColor(item.status) }]} />
      <View style={styles.bookingCardContent}>
        <Text style={styles.bookingGuest}>{item.guest_name}</Text>
        <Text style={styles.bookingDates}>
          {checkIn} — {checkOut}
        </Text>
        <Text style={styles.bookingProperty}>{propertyName}</Text>
        <Text style={styles.bookingPrice}>
          {price} {curr}
        </Text>
      </View>
    </View>
  );
}

/** Круг аналитики с иконкой. */
function AnalyticsCircle({
  label,
  value,
  total,
  color,
  icon,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.analyticsCircleWrap}>
      <View style={[styles.analyticsCircle, { borderColor: color }, styles.analyticsCircleShadow]}>
        <Ionicons name={icon} size={20} color={color} style={styles.analyticsIcon} />
        <Text style={styles.analyticsCircleText}>
          {value}/{total}
        </Text>
      </View>
      <Text style={styles.analyticsLabel}>{label}</Text>
    </View>
  );
}

const chartConfig = {
  backgroundColor: colors.background,
  backgroundGradientFrom: colors.background,
  backgroundGradientTo: colors.background,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
  labelColor: () => colors.textSecondary,
};

export function ObjectsScreen() {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const {
    data: bookings = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({ queryKey: ['bookings'], queryFn: fetchBookingsWithProperty });

  const markedDates = useMemo(() => buildMarkedDatesPeriod(bookings), [bookings]);
  const markedDatesWithSelection = useMemo(() => {
    if (!selectedDate) return markedDates;
    const base = markedDates[selectedDate];
    return {
      ...markedDates,
      [selectedDate]: { ...(base || {}), selected: true },
    };
  }, [markedDates, selectedDate]);
  const {
    arrivalsCount,
    departuresCount,
    staysCount,
    newCount,
    modifiedCount,
    cancelledCount,
    totalLeftSum,
    bookingsInMonth,
  } = useMonthAnalytics(bookings, currentMonth, selectedDate);

  const listData = useMemo(() => {
    if (selectedDate) return filterBookingsByDate(bookingsInMonth, selectedDate);
    return bookingsInMonth;
  }, [bookingsInMonth, selectedDate]);

  const onDayPress = (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
  };

  const currency = listData[0]?.currency ?? DEFAULT_CURRENCY;

  if (isLoading) {
    return (
      <View style={[styles.centered, styles.bgLight]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.centered, styles.bgLight]}>
        <Text style={styles.errorText}>Не удалось загрузить бронирования</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['bookings'] })}
            colors={[colors.primary]}
          />
        }
      >
        {/* Календарь: свободные даты белые, прошлые серые, period по статусу. */}
        <Calendar
          current={`${currentMonth}-01`}
          onMonthChange={(m) => setCurrentMonth(m.dateString.slice(0, 7))}
          onDayPress={onDayPress}
          markedDates={markedDatesWithSelection}
          markingType="period"
          theme={{
            dayTextColor: '#000',
            textDisabledColor: '#d9e1e8',
            todayTextColor: colors.primary,
            selectedDayBackgroundColor: colors.primary,
            selectedDayTextColor: '#fff',
            arrowColor: colors.primary,
          }}
          style={styles.calendar}
        />

        {/* Круговая аналитика: Arrival / Departure / Stay с иконками и тенью. */}
        <View style={styles.analyticsRow}>
          <AnalyticsCircle
            label="ARRIVAL"
            value={arrivalsCount}
            total={Math.max(arrivalsCount, 1)}
            color={colors.arrivalGreen}
            icon="arrow-down"
          />
          <AnalyticsCircle
            label="DEPARTURE"
            value={departuresCount}
            total={Math.max(departuresCount, 1)}
            color={colors.departureBlue}
            icon="arrow-up"
          />
          <AnalyticsCircle
            label="STAY"
            value={staysCount}
            total={Math.max(staysCount, 1)}
            color={colors.stayLightBlue}
            icon="bed-outline"
          />
        </View>

        {/* All properties — заглушка. */}
        <Pressable
          style={styles.dropdown}
          onPress={() => Alert.alert('Скоро', 'Выбор объекта будет доступен в следующей версии.')}
        >
          <Text style={styles.dropdownText}>All properties</Text>
          <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
        </Pressable>

        {/* Список броней (по выбранному дню или по месяцу). */}
        {listData.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyText}>Нет броней на этот месяц</Text>
          </View>
        ) : (
          <>
            <FlatList
              data={listData}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <BookingCard item={item} currency={currency} />}
              scrollEnabled={false}
              contentContainerStyle={styles.listContent}
            />

            {/* Total left — BarChart (один столбец для MVP). */}
            <View style={styles.chartSection}>
              <Text style={styles.chartTitle}>Total left</Text>
              <BarChart
                data={{
                  labels: [''],
                  datasets: [{ data: [totalLeftSum || 0] }],
                }}
                width={Dimensions.get('window').width - 48}
                height={180}
                chartConfig={chartConfig}
                style={styles.chart}
                showBarTops={false}
                fromZero
              />
              <Text style={styles.chartSum}>
                {totalLeftSum.toLocaleString('ru-RU')} {currency}
              </Text>
            </View>

            {/* Счёты: New / Modified / Cancelled (без % к прошлому месяцу — заглушка). */}
            <View style={styles.countsRow}>
              <Text style={[styles.countText, { color: colors.successCalendar }]}>
                New {newCount}
              </Text>
              <Text style={[styles.countText, { color: colors.primary }]}>
                Modified {modifiedCount}
              </Text>
              <Text style={[styles.countText, { color: colors.cancelled }]}>
                Cancelled {cancelledCount}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* FAB: добавить бронь (заглушка). */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => Alert.alert('Добавить бронь', 'Скоро будет доступно.')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundLight,
  },
  bgLight: {
    backgroundColor: colors.backgroundLight,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  calendar: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
    minHeight: 320,
  },
  analyticsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  analyticsCircleWrap: {
    alignItems: 'center',
  },
  analyticsCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  analyticsCircleShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  analyticsIcon: {
    position: 'absolute',
    top: 8,
  },
  analyticsCircleText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  analyticsLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 6,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.background,
    borderRadius: 12,
  },
  dropdownText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  bookingCard: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  bookingStrip: {
    width: 4,
    minHeight: 80,
  },
  bookingCardContent: {
    flex: 1,
    padding: 12,
  },
  bookingGuest: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  bookingDates: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  bookingProperty: {
    fontSize: 14,
    color: colors.primary,
    marginTop: 4,
  },
  bookingPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 12,
  },
  chartSection: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  chart: {
    borderRadius: 8,
  },
  chartSum: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 8,
    textAlign: 'center',
  },
  countsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
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
