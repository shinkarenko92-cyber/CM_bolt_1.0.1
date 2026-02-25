/**
 * Аналитика: макет analytics_&_insights — табы Day/Week/Month/Year,
 * метрики Occupancy/ADR/RevPAR, Revenue график, Room Type бары.
 * Открывается из Settings. Данные из bookings или моки.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { TrendBadge } from '../components/ui/TrendBadge';

type PeriodTab = 'day' | 'week' | 'month' | 'year';

const MOCK_OCCUPANCY = 84;
const MOCK_ADR = 185;
const MOCK_REVPAR = 155;
const MOCK_REVENUE = 124500;
const MOCK_TREND = 2.4;

export function AnalyticsScreen() {
  const navigation = useNavigation();
  const [period, setPeriod] = useState<PeriodTab>('month');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Аналитика и инсайты</Text>
        <View style={styles.headerRight} />
      </View>
      <View style={styles.tabs}>
        {(['day', 'week', 'month', 'year'] as const).map((p) => (
          <Pressable key={p} onPress={() => setPeriod(p)} style={[styles.tab, period === p && styles.tabActive]}>
            <Text style={[styles.tabText, period === p && styles.tabTextActive]}>
              {p === 'day' ? 'День' : p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : 'Год'}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <View style={styles.metricHead}>
              <Text style={styles.metricLabel}>Загрузка</Text>
              <Ionicons name="bed-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.metricValue}>{MOCK_OCCUPANCY}%</Text>
            <View style={styles.trendRow}>
              <TrendBadge value={MOCK_TREND} />
            </View>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${MOCK_OCCUPANCY}%` }]} />
            </View>
          </View>
          <View style={styles.metricCard}>
            <View style={styles.metricHead}>
              <Text style={styles.metricLabel}>ADR</Text>
              <Ionicons name="card-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.metricValue}>{MOCK_ADR} ₽</Text>
            <View style={styles.trendRow}>
              <TrendBadge value={1.5} />
            </View>
          </View>
          <View style={styles.metricCard}>
            <View style={styles.metricHead}>
              <Text style={styles.metricLabel}>RevPAR</Text>
              <Ionicons name="bar-chart-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.metricValue}>{MOCK_REVPAR} ₽</Text>
            <View style={styles.trendRow}>
              <TrendBadge value={3.8} />
            </View>
          </View>
        </View>
        <View style={styles.revenueCard}>
          <View style={styles.revenueHead}>
            <View>
              <Text style={styles.revenueLabel}>Выручка vs прошлый год</Text>
              <Text style={styles.revenueValue}>{MOCK_REVENUE.toLocaleString('ru-RU')} ₽</Text>
            </View>
            <View style={styles.revenueRight}>
              <Text style={styles.revenueTrend}>+12%</Text>
              <Text style={styles.revenueSub}>За 30 дней</Text>
            </View>
          </View>
          <View style={styles.chartPlaceholder}>
            <Ionicons name="trending-up" size={48} color="rgba(0,189,164,0.4)" />
            <Text style={styles.chartPlaceholderText}>График выручки</Text>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>По типам номеров</Text>
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>Standard</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: '90%' }]} />
            </View>
            <Text style={styles.barValue}>90%</Text>
          </View>
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>Suite</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: '65%' }]} />
            </View>
            <Text style={styles.barValue}>65%</Text>
          </View>
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>Family</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: '50%' }]} />
            </View>
            <Text style={styles.barValue}>50%</Text>
          </View>
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>Deluxe</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: '30%' }]} />
            </View>
            <Text style={styles.barValue}>30%</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,189,164,0.15)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textDark,
  },
  headerRight: {
    width: 40,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate800,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: colors.cardDark,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,189,164,0.1)',
  },
  metricHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textDark,
  },
  trendRow: {
    marginTop: 8,
  },
  progressBg: {
    height: 6,
    backgroundColor: colors.slate800,
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  revenueCard: {
    backgroundColor: colors.cardDark,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.slate800,
    marginBottom: 24,
  },
  revenueHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  revenueLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  revenueValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textDark,
  },
  revenueRight: {
    alignItems: 'flex-end',
  },
  revenueTrend: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
  },
  revenueSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chartPlaceholder: {
    height: 160,
    backgroundColor: 'rgba(0,189,164,0.08)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartPlaceholderText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 12,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  barLabel: {
    width: 70,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textDark,
  },
  barBg: {
    flex: 1,
    height: 10,
    backgroundColor: colors.slate800,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 5,
  },
  barValue: {
    width: 36,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'right',
  },
});
