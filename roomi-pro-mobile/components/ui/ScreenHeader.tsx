/**
 * Общий header экрана: лого/название, поиск, уведомления (по макетам).
 * Цвета из useTheme() — без пропа dark.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  logoUri?: string | null;
  onSearch?: () => void;
  onNotifications?: () => void;
  showNotificationBadge?: boolean;
}

export function ScreenHeader({
  title,
  subtitle,
  logoUri,
  onSearch,
  onNotifications,
  showNotificationBadge = false,
}: ScreenHeaderProps) {
  const { colors } = useTheme();
  const bg = { backgroundColor: colors.tabBar };
  const iconBg = colors.primaryMuted;

  return (
    <View style={[styles.header, bg, { borderBottomColor: colors.border }]}>
      <View style={styles.left}>
        <View style={[styles.logoWrap, { backgroundColor: iconBg, borderColor: colors.primary + '40' }]}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.logoImage} resizeMode="cover" />
          ) : (
            <Ionicons name="business-outline" size={24} color={colors.primary} />
          )}
        </View>
        <View>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
          ) : null}
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        {onSearch != null && (
          <TouchableOpacity onPress={onSearch} style={[styles.iconBtn, { backgroundColor: iconBg }]} activeOpacity={0.7}>
            <Ionicons name="search-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        )}
        {onNotifications != null && (
          <TouchableOpacity onPress={onNotifications} style={[styles.iconBtn, { backgroundColor: iconBg }]} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
            {showNotificationBadge && <View style={[styles.badge, { borderColor: colors.tabBar }]} />}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  logoWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 2,
  },
});
