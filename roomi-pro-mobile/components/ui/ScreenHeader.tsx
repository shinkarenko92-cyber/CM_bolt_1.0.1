/**
 * Общий header экрана: лого/название, поиск, уведомления (как в макетах).
 * Использует полупрозрачный фон; для blur — обернуть в BlurView при наличии expo-blur.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  logoUri?: string | null;
  onSearch?: () => void;
  onNotifications?: () => void;
  showNotificationBadge?: boolean;
  dark?: boolean;
}

export function ScreenHeader({
  title,
  subtitle,
  logoUri,
  onSearch,
  onNotifications,
  showNotificationBadge = false,
  dark = true,
}: ScreenHeaderProps) {
  const bg = dark ? { backgroundColor: 'rgba(15,35,33,0.95)' } : { backgroundColor: 'rgba(255,255,255,0.95)' };
  const textColor = dark ? colors.textDark : colors.text;
  const subColor = dark ? '#94a3b8' : colors.textSecondary;
  const iconColor = dark ? colors.textDark : colors.text;
  const iconBg = dark ? 'rgba(0,189,164,0.2)' : 'rgba(0,189,164,0.1)';

  return (
    <View style={[styles.header, bg]}>
      <View style={styles.left}>
        <View style={[styles.logoWrap, { backgroundColor: iconBg }]}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.logoImage} resizeMode="cover" />
          ) : (
            <Ionicons name="business-outline" size={24} color={colors.primary} />
          )}
        </View>
        <View>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: subColor }]} numberOfLines={1}>{subtitle}</Text>
          ) : null}
          <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>{title}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        {onSearch != null && (
          <TouchableOpacity onPress={onSearch} style={[styles.iconBtn, { backgroundColor: iconBg }]} activeOpacity={0.7}>
            <Ionicons name="search-outline" size={24} color={iconColor} />
          </TouchableOpacity>
        )}
        {onNotifications != null && (
          <TouchableOpacity onPress={onNotifications} style={[styles.iconBtn, { backgroundColor: iconBg }]} activeOpacity={0.7}>
            <Ionicons name="notifications-outline" size={24} color={iconColor} />
            {showNotificationBadge && <View style={styles.badge} />}
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
    borderBottomColor: 'rgba(0,189,164,0.15)',
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
    borderColor: 'rgba(0,189,164,0.25)',
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
    borderColor: colors.backgroundDark,
  },
});
