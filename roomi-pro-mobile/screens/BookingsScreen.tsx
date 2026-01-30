/**
 * Бронирования: useQuery + Realtime (канал bookings-changes, cleanup removeChannel).
 */
import React, { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, type Booking } from '../lib/supabase';
import { colors } from '../constants/colors';

async function fetchBookings(): Promise<Booking[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('check_in', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function BookingCard({ item }: { item: Booking }) {
  const checkIn = item.check_in.split('T')[0];
  const checkOut = item.check_out.split('T')[0];
  return (
    <View style={styles.card}>
      <Text style={styles.guestName}>{item.guest_name}</Text>
      <Text style={styles.dates}>
        {checkIn} — {checkOut}
      </Text>
      <Text style={styles.status}>{item.status}</Text>
      {item.total_price ? (
        <Text style={styles.price}>
          {item.total_price} {item.currency}
        </Text>
      ) : null}
    </View>
  );
}

export function BookingsScreen() {
  const queryClient = useQueryClient();
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings'],
    queryFn: fetchBookings,
  });

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('bookings-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['bookings'] });
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [queryClient]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Бронирования</Text>
      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BookingCard item={item} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Нет бронирований</Text>
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
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 16,
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
  guestName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  dates: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  status: {
    fontSize: 14,
    color: colors.primary,
    marginTop: 4,
  },
  price: {
    fontSize: 14,
    color: colors.text,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 32,
  },
});
