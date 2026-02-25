/**
 * Бронирования: макет updated_reservations — header, поиск, табы All/Confirmed/Checked-in/Pending,
 * карточки (аватар, гость, даты, комната, статус, сумма). Realtime + DetailsBookingModal.
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { supabase, type BookingWithProperty, type Property } from '../lib/supabase';
import { DetailsBookingModal } from './DetailsBookingModal';
import { AddBookingModal } from './AddBookingModal';

async function fetchBookings(): Promise<BookingWithProperty[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('bookings')
    .select('*, properties(name)')
    .order('check_in', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BookingWithProperty[];
}

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

function sourceLabel(source: string): string {
  if (source === 'avito') return 'Avito';
  if (source === 'direct' || source === 'manual') return 'Прямой';
  if (source === 'booking') return 'Booking';
  return source;
}

function statusColor(
  status: string,
  c: { success: string; warning: string; error: string; primary: string }
): string {
  if (status === 'confirmed') return c.success;
  if (status === 'pending') return c.warning;
  if (status === 'cancelled') return c.error;
  return c.primary;
}

function statusLabel(status: string): string {
  if (status === 'confirmed') return 'Подтверждено';
  if (status === 'pending') return 'Ожидание';
  if (status === 'cancelled') return 'Отменено';
  return status;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn + 'T12:00:00').getTime();
  const b = new Date(checkOut + 'T12:00:00').getTime();
  return Math.ceil((b - a) / (1000 * 60 * 60 * 24));
}

function formatDateShort(s: string): string {
  const d = new Date(s + 'T12:00:00');
  return `${d.getDate()} ${['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][d.getMonth()]}`;
}

function BookingCard({
  item,
  onPress,
  colors: c,
}: {
  item: BookingWithProperty;
  onPress: () => void;
  colors: import('../constants/theme').ThemeColors;
}) {
  const checkIn = item.check_in.split('T')[0];
  const checkOut = item.check_out.split('T')[0];
  const propertyName = (item as BookingWithProperty & { properties?: { name: string } }).properties?.name ?? '—';
  const nights = nightsBetween(checkIn, checkOut);
  const sc = statusColor(item.status, c);
  return (
    <Pressable style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]} onPress={onPress}>
      <View style={styles.cardLeft}>
        <View style={[styles.avatar, { backgroundColor: c.input }]}>
          <Text style={[styles.avatarText, { color: c.primary }]}>{(item.guest_name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.guestName, { color: c.text }]}>{item.guest_name || '—'}</Text>
          <Text style={[styles.dates, { color: c.textSecondary }]}>
            {formatDateShort(checkIn)} — {formatDateShort(checkOut)} • {nights} ноч.
          </Text>
          <View style={styles.cardBadges}>
            <View style={[styles.roomBadge, { backgroundColor: c.primaryMuted }]}>
              <Text style={[styles.roomBadgeText, { color: c.primary }]}>{propertyName}</Text>
            </View>
            <Text style={[styles.typeText, { color: c.textSecondary }]}>{sourceLabel(item.source)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardRight}>
        <View style={[styles.statusBadge, { backgroundColor: sc + '20' }]}>
          <View style={[styles.statusDot, { backgroundColor: sc }]} />
          <Text style={[styles.statusBadgeText, { color: sc }]}>{statusLabel(item.status)}</Text>
        </View>
        <Text style={[styles.price, { color: c.text }]}>{item.total_price ?? 0} {item.currency}</Text>
      </View>
    </Pressable>
  );
}

type TabFilter = 'all' | 'confirmed' | 'pending';

export function BookingsScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [selectedBooking, setSelectedBooking] = useState<BookingWithProperty | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [tab, setTab] = useState<TabFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const {
    data: bookings = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['bookings'], queryFn: fetchBookings });

  const { data: properties = [] } = useQuery({ queryKey: ['properties'], queryFn: fetchProperties });

  const filteredBookings = useMemo(() => {
    let list = bookings;
    if (tab === 'confirmed') list = list.filter((b) => (b.status || '').toLowerCase() === 'confirmed');
    else if (tab === 'pending') list = list.filter((b) => (b.status || '').toLowerCase() === 'pending');
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (b) =>
          (b.guest_name || '').toLowerCase().includes(q) ||
          ((b as BookingWithProperty & { properties?: { name: string } }).properties?.name ?? '').toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [bookings, tab, searchQuery]);

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
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>Не удалось загрузить бронирования</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIconWrap, { backgroundColor: colors.primaryMuted }]}>
            <Ionicons name="menu" size={22} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Бронирования</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.headerBtn, { backgroundColor: colors.primaryMuted }]} onPress={() => {}}>
            <Ionicons name="notifications-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setAddModalVisible(true)}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={[styles.searchWrap, { backgroundColor: colors.input }]}>
        <Ionicons name="search-outline" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Гость, объект или ID брони"
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <Ionicons name="options-outline" size={20} color={colors.textSecondary} style={styles.searchIcon} />
      </View>
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(['all', 'confirmed', 'pending'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && { borderBottomColor: colors.primary }]}>
            <Text style={[styles.tabText, { color: colors.textSecondary }, tab === t && { color: colors.primary, fontWeight: '700' }]}>
              {t === 'all' ? 'Все' : t === 'confirmed' ? 'Подтверждённые' : 'Ожидание'}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={filteredBookings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BookingCard item={item} onPress={() => openModal(item)} colors={colors} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Нет бронирований</Text>
        }
      />
      <DetailsBookingModal
        visible={modalVisible}
        booking={selectedBooking}
        propertyName={(selectedBooking as BookingWithProperty & { properties?: { name: string } } | null)?.properties?.name ?? null}
        onClose={closeModal}
      />
      <AddBookingModal
        visible={addModalVisible}
        properties={properties}
        onClose={() => setAddModalVisible(false)}
        onSuccess={() => {
          setAddModalVisible(false);
          queryClient.invalidateQueries({ queryKey: ['bookings'] });
          queryClient.invalidateQueries({ queryKey: ['properties'] });
        }}
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
  errorText: {
    fontSize: 16,
    marginBottom: 16,
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginHorizontal: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 24,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  tab: {
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 120,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 8,
    marginVertical: 6,
    borderWidth: 1,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardBody: {
    flex: 1,
  },
  guestName: {
    fontSize: 16,
    fontWeight: '700',
  },
  dates: {
    fontSize: 12,
    marginTop: 2,
  },
  cardBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  roomBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  roomBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  typeText: {
    fontSize: 12,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    marginBottom: 6,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 32,
  },
});
