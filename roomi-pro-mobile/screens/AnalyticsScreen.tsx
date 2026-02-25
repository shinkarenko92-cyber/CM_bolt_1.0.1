/**
 * Аналитика: макет analytics_&_insights — табы Day/Week/Month/Year,
 * метрики Occupancy/ADR/RevPAR, Revenue график, Room Type бары. Цвета из useTheme().
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { TrendBadge } from '../components/ui/TrendBadge';

type PeriodTab = 'day' | 'week' | 'month' | 'year';

const MOCK_OCCUPANCY = 84;
const MOCK_ADR = 185;
const MOCK_REVPAR = 155;
const MOCK_REVENUE = 124500;
const MOCK_TREND = 2.4;

export function AnalyticsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [period, setPeriod] = useState<PeriodTab>('month');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Аналитика и инсайты</Text>
        <View style={styles.headerRight} />
      </View>
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(['day', 'week', 'month', 'year'] as const).map((p) => (
          <Pressable key={p} onPress={() => setPeriod(p)} style={[styles.tab, period === p && { borderBottomColor: colors.primary }]}>
            <Text style={[styles.tabText, { color: colors.textSecondary }, period === p && { color: colors.primary, fontWeight: '700' }]}>
              {p === 'day' ? 'День' : p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : 'Год'}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.primaryMuted }]}>
            <View style={styles.metricHead}>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Загрузка</Text>
              <Ionicons name="bed-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.metricValue, { color: colors.text }]}>{MOCK_OCCUPANCY}%</Text>
            <View style={styles.trendRow}>
              <TrendBadge value={MOCK_TREND} />
            </View>
            <View style={[styles.progressBg, { backgroundColor: colors.progressTrack }]}>
              <View style={[styles.progressFill, { width: `${MOCK_OCCUPANCY}%`, backgroundColor: colors.primary }]} />
            </View>
          </View>
          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.primaryMuted }]}>
            <View style={styles.metricHead}>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>ADR</Text>
              <Ionicons name="card-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.metricValue, { color: colors.text }]}>{MOCK_ADR} ₽</Text>
            <View style={styles.trendRow}>
              <TrendBadge value={1.5} />
            </View>
          </View>
          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.primaryMuted }]}>
            <View style={styles.metricHead}>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>RevPAR</Text>
              <Ionicons name="bar-chart-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.metricValue, { color: colors.text }]}>{MOCK_REVPAR} ₽</Text>
            <View style={styles.trendRow}>
              <TrendBadge value={3.8} />
            </View>
          </View>
        </View>
        <View style={[styles.revenueCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.revenueHead}>
            <View>
              <Text style={[styles.revenueLabel, { color: colors.textSecondary }]}>Выручка vs прошлый год</Text>
              <Text style={[styles.revenueValue, { color: colors.text }]}>{MOCK_REVENUE.toLocaleString('ru-RU')} ₽</Text>
            </View>
            <View style={styles.revenueRight}>
              <Text style={[styles.revenueTrend, { color: colors.success }]}>+12%</Text>
              <Text style={[styles.revenueSub, { color: colors.textSecondary }]}>За 30 дней</Text>
            </View>
          </View>
          <View style={styles.chartPlaceholder}>
            <Ionicons name="trending-up" size={48} color="rgba(0,189,164,0.4)" />
            <Text style={[styles.chartPlaceholderText, { color: colors.textSecondary }]}>График выручки</Text>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>По типам номеров</Text>
          <View style={styles.barRow}>
            <Text style={[styles.barLabel, { color: colors.text }]}>Standard</Text>
            <View style={[styles.barBg, { backgroundColor: colors.progressTrack }]}>
              <View style={[styles.barFill, { width: '90%', backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.barValue, { color: colors.primary }]}>90%</Text>
          </View>
          <View style={styles.barRow}>
            <Text style={[styles.barLabel, { color: colors.text }]}>Suite</Text>
            <View style={[styles.barBg, { backgroundColor: colors.progressTrack }]}>
              <View style={[styles.barFill, { width: '65%', backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.barValue, { color: colors.primary }]}>65%</Text>
          </View>
          <View style={styles.barRow}>
            <Text style={[styles.barLabel, { color: colors.text }]}>Family</Text>
            <View style={[styles.barBg, { backgroundColor: colors.progressTrack }]}>
              <View style={[styles.barFill, { width: '50%', backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.barValue, { color: colors.primary }]}>50%</Text>
          </View>
          <View style={styles.barRow}>
            <Text style={[styles.barLabel, { color: colors.text }]}>Deluxe</Text>
            <View style={[styles.barBg, { backgroundColor: colors.progressTrack }]}>
              <View style={[styles.barFill, { width: '30%', backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.barValue, { color: colors.primary }]}>30%</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
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
  },
  headerRight: {
    width: 40,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 24,
    borderBottomWidth: 1,
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
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
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
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  trendRow: {
    marginTop: 8,
  },
  progressBg: {
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  revenueCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
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
    marginBottom: 4,
  },
  revenueValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  revenueRight: {
    alignItems: 'flex-end',
  },
  revenueTrend: {
    fontSize: 14,
    fontWeight: '700',
  },
  revenueSub: {
    fontSize: 11,
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
    marginTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
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
  },
  barBg: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
  },
  barValue: {
    width: 36,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
});
