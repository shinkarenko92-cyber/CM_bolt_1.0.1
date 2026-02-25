/**
 * Карточка метрики: иконка, название, большое число, опционально тренд (+X% / -X%).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { TrendBadge } from './TrendBadge';

export interface StatCardProps {
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'default';
  dark?: boolean;
}

export function StatCard({
  label,
  value,
  trend,
  trendLabel,
  icon,
  variant = 'default',
  dark = true,
}: StatCardProps) {
  const isPrimary = variant === 'primary';
  const bg = isPrimary ? colors.primary : (dark ? colors.cardDark : '#fff');
  const valueColor = isPrimary ? '#fff' : (dark ? colors.textDark : colors.text);
  const labelColor = isPrimary ? 'rgba(255,255,255,0.85)' : (dark ? '#94a3b8' : colors.textSecondary);
  const trendColor = isPrimary ? '#fff' : colors.primary;

  return (
    <View style={[styles.card, { backgroundColor: bg }, !isPrimary && dark && styles.cardBorder]}>
      {icon != null && (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={14} color={trendColor} />
        </View>
      )}
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
      {(trend != null || trendLabel) && (
        <View style={styles.trendRow}>
          {trend != null && (
            <TrendBadge value={trend} inverted={isPrimary} />
          )}
          {trendLabel ? (
            <Text style={[styles.trendLabel, { color: trendColor }]}>{trendLabel}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    minHeight: 100,
  },
  cardBorder: {
    borderWidth: 1,
    borderColor: colors.slate800,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  trendLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  iconWrap: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
});
