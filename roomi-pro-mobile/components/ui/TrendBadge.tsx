/**
 * Бейдж тренда: +X% (зелёный) или -X% (красный). Цвета из useTheme().
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/useTheme';

export interface TrendBadgeProps {
  value: number;
  inverted?: boolean;
}

export function TrendBadge({ value, inverted = false }: TrendBadgeProps) {
  const { colors } = useTheme();
  const isPositive = value >= 0;
  const color = isPositive ? colors.success : colors.error;
  const bg = inverted ? 'rgba(255,255,255,0.2)' : (isPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)');
  const textColor = inverted ? '#fff' : color;

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Ionicons
        name={isPositive ? 'trending-up' : 'trending-down'}
        size={12}
        color={textColor}
        style={styles.icon}
      />
      <Text style={[styles.text, { color: textColor }]}>
        {isPositive ? '+' : ''}{value.toFixed(1)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  icon: {
    marginLeft: 0,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
  },
});
