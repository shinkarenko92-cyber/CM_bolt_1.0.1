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
import { supabase, type BookingWithProperty, type Property } from '../lib/supabase';
import { colors } from '../constants/colors';
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

function statusColor(status: string): string {
  if (status === 'confirmed') return colors.success;
  if (status === 'pending') return colors.warning;
  if (status === 'cancelled') return colors.cancelled;
  return colors.primary;
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
}: {
  item: BookingWithProperty;
  onPress: () => void;
}) {
  const checkIn = item.check_in.split('T')[0];
  const checkOut = item.check_out.split('T')[0];
  const propertyName = (item as BookingWithProperty & { properties?: { name: string } }).properties?.name ?? '—';
  const nights = nightsBetween(checkIn, checkOut);
  const sc = statusColor(item.status);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardLeft}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(item.guest_name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.guestName}>{item.guest_name || '—'}</Text>
          <Text style={styles.dates}>
            {formatDateShort(checkIn)} — {formatDateShort(checkOut)} • {nights} ноч.
          </Text>
          <View style={styles.cardBadges}>
            <View style={styles.roomBadge}>
              <Text style={styles.roomBadgeText}>{propertyName}</Text>
            </View>
            <Text style={styles.typeText}>{sourceLabel(item.source)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardRight}>
        <View style={[styles.statusBadge, { backgroundColor: sc + '20' }]}>
          <View style={[styles.statusDot, { backgroundColor: sc }]} />
          <Text style={[styles.statusBadgeText, { color: sc }]}>{statusLabel(item.status)}</Text>
        </View>
        <Text style={styles.price}>{item.total_price ?? 0} {item.currency}</Text>
      </View>
    </Pressable>
  );
}

type TabFilter = 'all' | 'confirmed' | 'pending';

export function BookingsScreen() {
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
      <View style={[styles.centered, styles.bgDark]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.centered, styles.bgDark]}>
        <Text style={styles.errorText}>Не удалось загрузить бронирования</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="menu" size={22} color={colors.primary} />
          </View>
          <Text style={styles.headerTitle}>Бронирования</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => {}}>
            <Ionicons name="notifications-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => setAddModalVisible(true)}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Гость, объект или ID брони"
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <Ionicons name="options-outline" size={20} color={colors.textSecondary} style={styles.searchIcon} />
      </View>
      <View style={styles.tabs}>
        {(['all', 'confirmed', 'pending'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'all' ? 'Все' : t === 'confirmed' ? 'Подтверждённые' : 'Ожидание'}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={filteredBookings}
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
    backgroundColor: colors.backgroundDark,
  },
  bgDark: {
    backgroundColor: colors.backgroundDark,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: colors.textDark,
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,189,164,0.15)',
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
    backgroundColor: 'rgba(0,189,164,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textDark,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,189,164,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    height: 44,
    backgroundColor: colors.slate800,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginHorizontal: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textDark,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate800,
    marginBottom: 8,
  },
  tab: {
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 8,
    paddingBottom: 120,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardDark,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 8,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: colors.slate800,
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
    backgroundColor: colors.slate800,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  cardBody: {
    flex: 1,
  },
  guestName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDark,
  },
  dates: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  roomBadge: {
    backgroundColor: 'rgba(0,189,164,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  roomBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  typeText: {
    fontSize: 12,
    color: colors.textSecondary,
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
    color: colors.textDark,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 32,
  },
});
