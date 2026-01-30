/**
 * Объекты: список properties (FlatList + refreshControl), календарь с разметкой по статусам бронирований.
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'react-native-calendars';
import { supabase, type Property, type Booking } from '../lib/supabase';
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

type BookingMark = Pick<Booking, 'check_in' | 'status'>;

async function fetchBookingsForCalendar(): Promise<BookingMark[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('check_in, status')
    .order('check_in', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BookingMark[];
}

function buildMarkedDates(
  bookings: Array<{ check_in: string; status: string }>
): Record<string, { marked: boolean; dotColor: string }> {
  const acc: Record<string, { marked: boolean; dotColor: string }> = {};
  for (const b of bookings) {
    const date = b.check_in.split('T')[0];
    if (!acc[date]) {
      acc[date] = {
        marked: true,
        dotColor: b.status === 'confirmed' ? colors.success : colors.warning,
      };
    }
  }
  return acc;
}

function PropertyCard({ item }: { item: Property }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      {item.address ? <Text style={styles.cardAddress}>{item.address}</Text> : null}
      <Text style={styles.cardPrice}>
        от {item.base_price} {item.currency}
      </Text>
    </View>
  );
}

export function ObjectsScreen() {
  const {
    data: properties = [],
    isLoading: loadingProperties,
    refetch: refetchProperties,
    isRefetching,
  } = useQuery({ queryKey: ['properties'], queryFn: fetchProperties });

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings-calendar'],
    queryFn: fetchBookingsForCalendar,
  });

  const markedDates = useMemo(() => buildMarkedDates(bookings), [bookings]);

  if (loadingProperties) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Calendar
        style={styles.calendar}
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
    padding: 16,
    paddingTop: 0,
  },
  card: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
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
  cardPrice: {
    fontSize: 14,
    color: colors.primary,
    marginTop: 8,
  },
});
