/**
 * Объекты: таблица доступности и тарифов по комнатам и датам (Airbnb PMS стиль).
 * Строки — объекты (properties), столбцы — дни месяца; ячейки — цветные блоки броней или пусто.
 * Под каждой строкой — Standard rate с ценами по дням. Pull-to-refresh, FAB "+".
 */
import React, { useMemo, useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase, type Property, type BookingWithProperty } from '../lib/supabase';
import { colors } from '../constants/colors';
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

/** Массив дат месяца YYYY-MM-DD для currentMonth (YYYY-MM). Локальная дата, не UTC. */
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

/** Формат заголовка месяца (например "August 2026"). */
function formatMonthTitle(currentMonth: string): string {
  const [y, m] = currentMonth.split('-').map(Number);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${monthNames[m - 1]} ${y}`;
}

/** Буква дня недели и число для заголовка (W / 22). */
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

export function ObjectsScreen() {
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth);

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
  const tableWidth = Math.max(dates.length * DAY_CELL_WIDTH, 400);

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
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Не удалось загрузить данные</Text>
          <TouchableOpacity
            style={styles.retryButton}
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
        {/* All properties — заглушка */}
        <Pressable
          style={styles.dropdown}
          onPress={() => Alert.alert('Скоро', 'Выбор объекта будет доступен.')}
        >
          <Text style={styles.dropdownText}>All properties</Text>
          <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
        </Pressable>

        {/* Навигация по месяцу */}
        <View style={styles.monthRow}>
          <Pressable onPress={goPrevMonth} style={styles.monthArrow} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.monthTitle}>{formatMonthTitle(currentMonth)}</Text>
          <Pressable onPress={goNextMonth} style={styles.monthArrow} hitSlop={12}>
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </Pressable>
        </View>

        {/* Таблица: левая колонка (названия) + горизонтальный скролл (даты и ячейки) */}
        {properties.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Нет объектов</Text>
          </View>
        ) : (
          <View style={styles.tableRow}>
            {/* Пустое состояние по броням в месяце */}
            {bookings.length === 0 && (
              <View style={styles.emptyBookingsBanner}>
                <Text style={styles.emptyBookingsText}>Нет броней в этом месяце</Text>
              </View>
            )}
            {/* Левая колонка: заголовок дат (пусто) + для каждой комнаты название и "Standard rate" */}
            <View style={[styles.leftColumn, { width: ROOM_NAME_WIDTH }]}>
              <View style={styles.headerCell} />
              {properties.flatMap((p) => [
                <View key={p.id} style={styles.roomNameCell}>
                  <Text style={styles.roomNameText} numberOfLines={2}>
                    {p.name.toUpperCase()}
                  </Text>
                </View>,
                <View key={`${p.id}-rate`} style={styles.rateLabelCell}>
                  <Text style={styles.rateLabelText}>Standard rate</Text>
                </View>,
              ])}
            </View>

            {/* Горизонтальный скролл: контент в колонку (заголовок дат + строки комнат) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              style={styles.horizontalScroll}
              contentContainerStyle={[styles.horizontalScrollContent, { minWidth: tableWidth, flexDirection: 'column' }]}
            >
              {/* Строка заголовков дат: буква дня (W T F...) + дата под ней */}
              <View style={styles.cellsRow}>
                {dates.map((date) => {
                  const { letter, date: dayNum } = getDayHeaderParts(date);
                  return (
                    <View key={date} style={styles.headerCellDay}>
                      <Text style={styles.headerDayLetter}>{letter}</Text>
                      <Text style={styles.headerDayNum}>{dayNum}</Text>
                    </View>
                  );
                })}
              </View>
              {/* Строки комнат: брони + Standard rate */}
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
        )}
      </ScrollView>

      {/* FAB: добавить бронь — заглушка */}
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
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
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
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: colors.background,
    borderRadius: 12,
  },
  dropdownText: {
    fontSize: 16,
    color: colors.text,
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
    color: colors.text,
    minWidth: 160,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
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
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: 8,
  },
  roomNameText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  rateLabelCell: {
    width: ROOM_NAME_WIDTH - 16,
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: 8,
  },
  rateLabelText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  horizontalScroll: {
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
    color: colors.textSecondary,
  },
  headerDayNum: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginTop: 2,
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  emptyBookingsBanner: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: colors.backgroundLight,
  },
  emptyBookingsText: {
    fontSize: 14,
    color: colors.textSecondary,
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
