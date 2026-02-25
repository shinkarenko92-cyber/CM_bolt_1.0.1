/**
 * Карточка метрики: иконка, название, большое число, опционально тренд.
 * Цвета из useTheme() — без пропа dark.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/useTheme';
import { TrendBadge } from './TrendBadge';

export interface StatCardProps {
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'default';
}

export function StatCard({
  label,
  value,
  trend,
  trendLabel,
  icon,
  variant = 'default',
}: StatCardProps) {
  const { colors } = useTheme();
  const isPrimary = variant === 'primary';
  const bg = isPrimary ? colors.primary : colors.card;
  const valueColor = isPrimary ? '#fff' : colors.text;
  const labelColor = isPrimary ? 'rgba(255,255,255,0.85)' : colors.textSecondary;
  const trendColor = isPrimary ? '#fff' : colors.primary;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: bg },
        !isPrimary && { borderWidth: 1, borderColor: colors.border },
      ]}
    >
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
