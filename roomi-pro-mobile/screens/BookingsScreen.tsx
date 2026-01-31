/**
 * Бронирования: карточки (гость, даты, объект, статус, сумма, источник),
 * onPress → DetailsBookingModal. Realtime + уведомление при INSERT (в dev build).
 * В Expo Go уведомления не работают — используй dev build.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { supabase, type Booking } from '../lib/supabase';
import { colors } from '../constants/colors';
import { DetailsBookingModal } from './DetailsBookingModal';

export type BookingWithProperty = Booking & {
  properties?: { name: string } | null;
};

async function fetchBookings(): Promise<BookingWithProperty[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('*, properties(name)')
    .order('check_in', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookingWithProperty[];
}

function sourceLabel(source: string): string {
  if (source === 'avito') return 'Avito';
  if (source === 'direct' || source === 'manual') return 'Прямой';
  if (source === 'booking') return 'Booking';
  return source;
}

function statusColor(status: string): string {
  if (status === 'confirmed') return colors.successCalendar;
  if (status === 'pending') return colors.warningCalendar;
  if (status === 'cancelled') return colors.cancelled;
  return colors.border;
}

function BookingCard({
  item,
  onPress,
}: {
  item: BookingWithProperty;
  onPress: () => void;
}) {
  const checkIn = item.check_in.split('T')[0];
  const checkOut = item.check_out.split('T')[0];
  const propertyName = item.properties?.name ?? '—';
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.guestName}>{item.guest_name}</Text>
      <Text style={styles.dates}>
        {checkIn} — {checkOut}
      </Text>
      <Text style={styles.propertyName}>{propertyName}</Text>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: statusColor(item.status) }]}>
          <Text style={styles.badgeText}>{item.status}</Text>
        </View>
        {item.total_price != null && (
          <Text style={styles.price}>
            {item.total_price} {item.currency}
          </Text>
        )}
      </View>
      <Text style={styles.source}>Источник: {sourceLabel(item.source)}</Text>
    </Pressable>
  );
}

export function BookingsScreen() {
  const queryClient = useQueryClient();
  const [selectedBooking, setSelectedBooking] = useState<BookingWithProperty | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const {
    data: bookings = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['bookings'], queryFn: fetchBookings });

  const isExpoGo =
    Constants.appOwnership === 'expo' || Constants.appOwnership === 'guest';

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('bookings-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        (payload) => {
          if (payload.schema !== 'public' || payload.table !== 'bookings') return;
          queryClient.invalidateQueries({ queryKey: ['bookings'] });
          if (payload.eventType === 'INSERT' && payload.new) {
            const record = payload.new as Record<string, unknown>;
            const guestName = (record.guest_name as string) || 'гостя';
            const checkIn = (record.check_in as string)?.split?.('T')?.[0] ?? '';
            if (__DEV__ && isExpoGo) {
              console.log('Пуш в dev-client:', guestName, checkIn);
              return;
            }
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic: Expo Go has no Nitro
              const Notifications = require('expo-notifications') as typeof import('expo-notifications');
              Notifications.scheduleNotificationAsync({
                content: {
                  title: 'Новая бронь!',
                  body: `От ${guestName} на ${checkIn}`,
                },
                trigger: null,
              }).catch(() => {});
            } catch {
              // ignore
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [queryClient, isExpoGo]);

  const openModal = (item: BookingWithProperty) => {
    setSelectedBooking(item);
    setModalVisible(true);
  };
  const closeModal = () => {
    setModalVisible(false);
    setSelectedBooking(null);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Не удалось загрузить бронирования</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Бронирования</Text>
      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BookingCard item={item} onPress={() => openModal(item)} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Нет бронирований</Text>
        }
      />
      <DetailsBookingModal
        visible={modalVisible}
        booking={selectedBooking}
        propertyName={selectedBooking?.properties?.name ?? null}
        onClose={closeModal}
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
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 16,
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
  propertyName: {
    fontSize: 14,
    color: colors.primary,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
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
  price: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  source: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 32,
  },
});
