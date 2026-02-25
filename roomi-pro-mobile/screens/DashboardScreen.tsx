/**
 * Dashboard: Today (arrivals/departures/stays), Revenue Today, Avg Daily Rate, Recent Activity.
 * Макет: updated_dashboard/code.html. Цвета из useTheme().
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { supabase, type BookingWithProperty, type Property } from '../lib/supabase';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { StatCard } from '../components/ui/StatCard';

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

function getTodayStr(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function getStats(
  bookings: BookingWithProperty[],
  todayStr: string
) {
  let arrivals = 0;
  let departures = 0;
  let stays = 0;
  let revenueToday = 0;

  for (const b of bookings) {
    const ci = b.check_in.split('T')[0];
    const co = b.check_out.split('T')[0];
    if (ci === todayStr) arrivals++;
    if (co === todayStr) departures++;
    if (ci <= todayStr && co > todayStr) {
      stays++;
      const nights = Math.ceil((new Date(co).getTime() - new Date(ci).getTime()) / (1000 * 60 * 60 * 24));
      if (nights > 0) revenueToday += (b.total_price ?? 0) / nights;
    }
  }

  const occupiedRoomNights = stays;
  const adr = occupiedRoomNights > 0 ? Math.round(revenueToday / occupiedRoomNights) : 0;
  revenueToday = Math.round(revenueToday);

  return { arrivals, departures, stays, revenueToday, adr };
}

function formatDate(s: string): string {
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DashboardScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const todayStr = getTodayStr();
  const paddingHoriz = 16;
  const gap = 16;
  const circleSize = (width - paddingHoriz * 2 - gap * 2) / 3;

  const { data: properties = [] } = useQuery({ queryKey: ['properties'], queryFn: fetchProperties });
  const {
    data: bookings = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['bookings'], queryFn: fetchBookings });

  const { arrivals, departures, stays, revenueToday, adr } = getStats(bookings, todayStr);
  const propertyName = properties[0]?.name ?? 'Roomi Pro';

  const recentBookings = [...bookings]
    .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at))
    .slice(0, 4);

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
        <Text style={[styles.errorText, { color: colors.text }]}>Не удалось загрузить данные</Text>
        <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetch()}>
          <Text style={styles.retryBtnText}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader
        title="Главная"
        subtitle={propertyName}
        onSearch={() => {}}
        onNotifications={() => (navigation as { navigate: (s: string) => void }).navigate('Settings')}
        showNotificationBadge={false}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Today */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Сегодня</Text>
            <View style={[styles.dateBadge, { backgroundColor: colors.input }]}>
              <Text style={[styles.dateBadgeText, { color: colors.textSecondary }]}>{formatDate(todayStr)}</Text>
            </View>
          </View>
          <View style={styles.circlesRow}>
            <View style={styles.circleWrap}>
              <TouchableOpacity
                style={[
                  styles.circle,
                  {
                    width: circleSize,
                    height: circleSize,
                    borderRadius: circleSize / 2,
                    backgroundColor: colors.card,
                    borderColor: colors.primaryMuted,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[styles.circleValue, { color: colors.primary }]}>{arrivals}</Text>
                <Text style={[styles.circleLabel, { color: colors.textSecondary }]}>Заезды</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.circleWrap}>
              <TouchableOpacity
                style={[
                  styles.circle,
                  {
                    width: circleSize,
                    height: circleSize,
                    borderRadius: circleSize / 2,
                    backgroundColor: colors.card,
                    borderColor: colors.primaryMuted,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[styles.circleValue, { color: colors.text }]}>{departures}</Text>
                <Text style={[styles.circleLabel, { color: colors.textSecondary }]}>Выезды</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.circleWrap}>
              <TouchableOpacity
                style={[
                  styles.circle,
                  {
                    width: circleSize,
                    height: circleSize,
                    borderRadius: circleSize / 2,
                    backgroundColor: colors.card,
                    borderColor: colors.primaryMuted,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[styles.circleValue, { color: colors.text }]}>{stays}</Text>
                <Text style={[styles.circleLabel, { color: colors.textSecondary }]}>Проживают</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Выручка за сегодня"
            value={`${revenueToday} ₽`}
            trend={12}
            trendLabel="к вчера"
            icon="trending-up"
            variant="primary"
          />
          <StatCard
            label="Ср. цена за ночь"
            value={`${adr} ₽`}
            trendLabel="Стабильно"
            icon="analytics-outline"
          />
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Недавняя активность</Text>
            <TouchableOpacity onPress={() => (navigation as { navigate: (s: string) => void }).navigate('Bookings')}>
              <Text style={[styles.viewAll, { color: colors.primary }]}>Всё</Text>
            </TouchableOpacity>
          </View>
          {recentBookings.length === 0 ? (
            <Text style={[styles.emptyActivity, { color: colors.textSecondary }]}>Нет недавних бронирований</Text>
          ) : (
            recentBookings.map((b) => {
              const propName = (b as BookingWithProperty & { properties?: { name: string } }).properties?.name ?? '—';
              const isCheckIn = b.check_in.split('T')[0] === todayStr;
              const isCheckOut = b.check_out.split('T')[0] === todayStr;
              let iconName: keyof typeof Ionicons.glyphMap = 'calendar-outline';
              let iconBg = colors.input;
              if (b.status === 'confirmed' && isCheckIn) {
                iconName = 'checkmark-circle-outline';
                iconBg = 'rgba(16,185,129,0.25)';
              } else if (b.status === 'pending') {
                iconName = 'time-outline';
                iconBg = 'rgba(245,158,11,0.25)';
              } else if (isCheckOut) {
                iconName = 'exit-outline';
                iconBg = colors.input;
              }
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    styles.activityCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => (navigation as { navigate: (s: string) => void }).navigate('Bookings')}
                >
                  <View style={[styles.activityIcon, { backgroundColor: iconBg }]}>
                    <Ionicons name={iconName} size={24} color={colors.primary} />
                  </View>
                  <View style={styles.activityBody}>
                    <Text style={[styles.activityTitle, { color: colors.text }]}>{propName} · {b.guest_name}</Text>
                    <Text style={[styles.activitySub, { color: colors.textSecondary }]}>
                      {b.check_in.split('T')[0]} — {b.check_out.split('T')[0]}
                    </Text>
                  </View>
                  <View style={styles.activityRight}>
                    <Text style={[styles.activityPrice, { color: colors.primary }]}>{b.total_price ?? 0} ₽</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  section: {
    marginBottom: 32,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  dateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  dateBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  circlesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  circleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  circle: {
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  circleValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  circleLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  viewAll: {
    fontSize: 14,
    fontWeight: '700',
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  activityIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  activityBody: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  activitySub: {
    fontSize: 12,
    marginTop: 2,
  },
  activityRight: {
    marginLeft: 8,
  },
  activityPrice: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyActivity: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
