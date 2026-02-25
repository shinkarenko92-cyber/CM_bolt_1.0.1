/**
 * Объекты: таблица доступности по комнатам и датам (Airbnb PMS стиль).
 * Горизонтальный скролл по датам, строки — объекты (название + Standard rate с ценами по дням).
 * Ячейки броней — цветные блоки по статусу; блок на несколько дней, внутри имя гостя.
 * Синхронизация скролла заголовка дней и ячеек (ref.scrollTo). Pull-to-refresh, FAB "+".
 */
import React, { useRef, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
  Alert,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { supabase, type Property, type BookingWithProperty } from '../lib/supabase';
import { DAY_CELL_WIDTH, ROOM_NAME_WIDTH } from '../constants/layout';
import { RoomRow } from '../components/RoomRow';

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

const DAY_LABELS = ['В', 'П', 'С', 'Ч', 'П', 'С', 'В'];

/** Даты месяца YYYY-MM-DD для currentMonth (YYYY-MM). */
function getDatesForMonth(currentMonth: string): string[] {
  const [y, m] = currentMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const dates: string[] = [];
  const mm = String(m).padStart(2, '0');
  for (let day = 1; day <= lastDay; day++) {
    const dd = String(day).padStart(2, '0');
    dates.push(`${y}-${mm}-${dd}`);
  }
  return dates;
}

function formatMonthTitle(currentMonth: string): string {
  const [y, m] = currentMonth.split('-').map(Number);
  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
  ];
  return `${monthNames[m - 1]} ${y}`;
}

function getDayHeaderParts(dateStr: string): { letter: string; date: number } {
  const d = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = d.getDay();
  const dayNum = d.getDate();
  const letter = DAY_LABELS[dayOfWeek] ?? '';
  return { letter, date: dayNum };
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Брони, пересекающиеся с текущим месяцем. */
function bookingsInMonth(bookings: BookingWithProperty[], firstDate: string, lastDate: string): BookingWithProperty[] {
  return bookings.filter((b) => {
    const ci = b.check_in.split('T')[0];
    const co = b.check_out.split('T')[0];
    return ci <= lastDate && co >= firstDate;
  });
}

export function ObjectsScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth);
  const headerScrollRef = useRef<ScrollView>(null);
  const bodyScrollRef = useRef<ScrollView>(null);
  const lastSyncedX = useRef(0);

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

  const dates = useMemo(() => getDatesForMonth(currentMonth), [currentMonth]);
  // Ширина с учётом отступов между ячейками (marginHorizontal: 1)
  const tableWidth = Math.max(dates.length * (DAY_CELL_WIDTH + 2), 400);
  const firstDate = dates[0] ?? '';
  const lastDate = dates[dates.length - 1] ?? '';
  const bookingsInCurrentMonth = useMemo(
    () => bookingsInMonth(bookings, firstDate, lastDate),
    [bookings, firstDate, lastDate]
  );
  const hasNoBookingsInMonth = properties.length > 0 && bookingsInCurrentMonth.length === 0;

  const syncScrollToBody = useCallback((x: number) => {
    if (Math.abs(x - lastSyncedX.current) < 1) return;
    lastSyncedX.current = x;
    bodyScrollRef.current?.scrollTo({ x, animated: false });
  }, []);

  const syncScrollToHeader = useCallback((x: number) => {
    if (Math.abs(x - lastSyncedX.current) < 1) return;
    lastSyncedX.current = x;
    headerScrollRef.current?.scrollTo({ x, animated: false });
  }, []);

  const onHeaderScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncScrollToBody(e.nativeEvent.contentOffset.x);
    },
    [syncScrollToBody]
  );

  const onBodyScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncScrollToHeader(e.nativeEvent.contentOffset.x);
    },
    [syncScrollToHeader]
  );

  const goPrevMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    if (m === 1) setCurrentMonth(`${y - 1}-12`);
    else setCurrentMonth(`${y}-${String(m - 1).padStart(2, '0')}`);
  };

  const goNextMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    if (m === 12) setCurrentMonth(`${y + 1}-01`);
    else setCurrentMonth(`${y}-${String(m + 1).padStart(2, '0')}`);
  };

  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['properties'] });
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
  };

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
      >
        <Pressable
          style={[styles.dropdown, { backgroundColor: colors.card }]}
          onPress={() => Alert.alert('Скоро', 'Выбор объекта будет доступен.')}
        >
          <Text style={[styles.dropdownText, { color: colors.text }]}>Все объекты</Text>
          <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
        </Pressable>

        <View style={styles.monthRow}>
          <Pressable onPress={goPrevMonth} style={styles.monthArrow} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.monthTitle, { color: colors.text }]}>{formatMonthTitle(currentMonth)}</Text>
          <Pressable onPress={goNextMonth} style={styles.monthArrow} hitSlop={12}>
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </Pressable>
        </View>

        {hasNoBookingsInMonth && (
          <View style={[styles.emptyBookingsBanner, { backgroundColor: colors.input }]}>
            <Text style={[styles.emptyBookingsText, { color: colors.textSecondary }]}>Нет броней в этом месяце</Text>
          </View>
        )}

        {properties.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Нет объектов</Text>
          </View>
        ) : (
          <View style={[styles.tableRow, { backgroundColor: colors.card }]}>
            {/* Левая колонка: заголовок дат (пусто) + для каждой комнаты название и Standard rate */}
            <View style={[styles.leftColumn, { width: ROOM_NAME_WIDTH }]}>
              <View style={styles.headerCell} />
              {properties.flatMap((p) => [
                <View key={p.id} style={styles.roomNameCell}>
                  <Text style={[styles.roomNameText, { color: colors.text }]} numberOfLines={2}>
                    {p.name}
                  </Text>
                </View>,
                <View key={`${p.id}-rate`} style={styles.rateLabelCell}>
                  <Text style={[styles.rateLabelText, { color: colors.textSecondary }]}>Standard rate</Text>
                </View>,
              ])}
            </View>

            {/* Правая часть: два горизонтальных скролла (заголовок дней + ячейки), синхронизация по ref.scrollTo */}
            <View style={styles.rightPart}>
              <ScrollView
                ref={headerScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.headerScroll}
                contentContainerStyle={[styles.horizontalScrollContent, { width: tableWidth }]}
                onScroll={onHeaderScroll}
                scrollEventThrottle={16}
              >
                <View style={styles.cellsRow}>
                  {dates.map((date) => {
                    const { letter, date: dayNum } = getDayHeaderParts(date);
                    return (
                      <View key={date} style={styles.headerCellDay}>
                        <Text style={[styles.headerDayLetter, { color: colors.textSecondary }]}>{letter}</Text>
                        <Text style={[styles.headerDayNum, { color: colors.text }]}>{dayNum}</Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
              <ScrollView
                ref={bodyScrollRef}
                horizontal
                showsHorizontalScrollIndicator={true}
                style={styles.bodyScroll}
                contentContainerStyle={[styles.horizontalScrollContent, { width: tableWidth, flexDirection: 'column' }]}
                onScroll={onBodyScroll}
                scrollEventThrottle={16}
              >
                {properties.map((p) => (
                  <RoomRow
                    key={p.id}
                    property={p}
                    dates={dates}
                    bookings={bookings.filter((b) => b.property_id === p.id)}
                  />
                ))}
              </ScrollView>
            </View>
          </View>
        )}
      </ScrollView>

      <Pressable
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.primary }, pressed && styles.fabPressed]}
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
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  dropdownText: {
    fontSize: 16,
    fontWeight: '500',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 16,
  },
  monthArrow: {
    padding: 4,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
    minWidth: 160,
    textAlign: 'center',
  },
  emptyBookingsBanner: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyBookingsText: {
    fontSize: 14,
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  tableRow: {
    flexDirection: 'row',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  leftColumn: {
    paddingLeft: 16,
  },
  headerCell: {
    width: ROOM_NAME_WIDTH - 16,
    minHeight: 44,
  },
  roomNameCell: {
    width: ROOM_NAME_WIDTH - 16,
    minHeight: 40,
    justifyContent: 'center',
    paddingRight: 8,
  },
  roomNameText: {
    fontSize: 12,
    fontWeight: '600',
  },
  rateLabelCell: {
    width: ROOM_NAME_WIDTH - 16,
    minHeight: 40,
    justifyContent: 'center',
    paddingRight: 8,
  },
  rateLabelText: {
    fontSize: 11,
  },
  rightPart: {
    flex: 1,
    flexDirection: 'column',
  },
  headerScroll: {
    maxHeight: 44,
  },
  bodyScroll: {
    flex: 1,
  },
  horizontalScrollContent: {
    flexGrow: 0,
  },
  cellsRow: {
    flexDirection: 'row',
  },
  headerCellDay: {
    width: DAY_CELL_WIDTH,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 1,
  },
  headerDayLetter: {
    fontSize: 11,
    fontWeight: '700',
  },
  headerDayNum: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
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
