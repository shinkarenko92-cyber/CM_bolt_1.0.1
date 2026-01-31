/**
 * Объекты: FlatList карточек (фото, название, адрес, цена ₾/ночь, бейдж active/inactive),
 * календарь с period-разметкой по бронированиям (confirmed/pending/cancelled).
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'react-native-calendars';
import { supabase, type Property } from '../lib/supabase';
import { colors } from '../constants/colors';

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

type BookingMark = { check_in: string; check_out: string; status: string };

async function fetchBookingsForCalendar(): Promise<BookingMark[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('check_in, check_out, status')
    .order('check_in', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BookingMark[];
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

/** Period-разметка: startingDay/endingDay/color по статусу (confirmed green, pending orange, cancelled red). */
function buildMarkedDatesPeriod(
  bookings: BookingMark[]
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

function PropertyCard({ item }: { item: Property }) {
  const isActive = item.status === 'active';
  return (
    <View style={styles.card}>
      <View style={styles.cardImageWrap}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={styles.placeholderImage} />
        )}
      </View>
      <Text style={styles.cardTitle}>{item.name}</Text>
      {item.address ? <Text style={styles.cardAddress}>{item.address}</Text> : null}
      <View style={styles.cardRow}>
        <Text style={styles.cardPrice}>
          от {item.base_price} {item.currency}/ночь
        </Text>
        <View
          style={[
            styles.badge,
            { backgroundColor: isActive ? colors.successCalendar : colors.inactiveBadge },
          ]}
        >
          <Text style={styles.badgeText}>{isActive ? 'active' : 'inactive'}</Text>
        </View>
      </View>
    </View>
  );
}

export function ObjectsScreen() {
  const {
    data: properties = [],
    isLoading: loadingProperties,
    isError: errorProperties,
    refetch: refetchProperties,
    isRefetching,
  } = useQuery({ queryKey: ['properties'], queryFn: fetchProperties });

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings-calendar'],
    queryFn: fetchBookingsForCalendar,
  });

  const markedDates = useMemo(() => buildMarkedDatesPeriod(bookings), [bookings]);

  if (loadingProperties) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (errorProperties) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Не удалось загрузить объекты</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetchProperties()}>
          <Text style={styles.retryButtonText}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Calendar
        style={styles.calendar}
        markingType="period"
        markedDates={markedDates}
        theme={{
          todayTextColor: colors.primary,
          selectedDayBackgroundColor: colors.primary,
          selectedDayTextColor: '#fff',
          arrowColor: colors.primary,
        }}
      />
      <Text style={styles.sectionTitle}>Мои объекты</Text>
      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PropertyCard item={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetchProperties()}
            colors={[colors.primary]}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
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
    marginBottom: 8,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 12,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardImageWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardImage: {
    width: '100%',
    height: 160,
  },
  placeholderImage: {
    width: '100%',
    height: 160,
    backgroundColor: colors.border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cardAddress: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cardPrice: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
