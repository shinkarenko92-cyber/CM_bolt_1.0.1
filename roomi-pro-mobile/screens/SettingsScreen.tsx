/**
 * Настройки: Профиль, Уведомления, Тема (светлая/тёмная), Приложение, Выйти.
 * Цвета из useTheme(). Переключатель темы — Light / Dark.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { nativeApplicationVersion, applicationId } from 'expo-application';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/useTheme';
import { useQueryClient } from '@tanstack/react-query';

function Row({
  icon,
  label,
  value,
  onPress,
  colors: c,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  colors: import('../constants/theme').ThemeColors;
}) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={[styles.row, { borderBottomColor: c.border }]} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <Ionicons name={icon} size={22} color={c.textSecondary} style={styles.rowIcon} />
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: c.text }]}>{label}</Text>
        {value != null ? <Text style={[styles.rowValue, { color: c.textSecondary }]}>{value}</Text> : null}
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={20} color={c.textSecondary} />
      ) : null}
    </Wrapper>
  );
}

function SectionTitle({ title, colors: c }: { title: string; colors: import('../constants/theme').ThemeColors }) {
  return <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>{title}</Text>;
}

function Divider({ colors: c }: { colors: import('../constants/theme').ThemeColors }) {
  return <View style={[styles.divider, { backgroundColor: c.border }]} />;
}

export function SettingsScreen() {
  const { colors, theme, setTheme } = useTheme();
  const navigation = useNavigation();
  const { user, profile, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [notifBookings, setNotifBookings] = useState(true);
  const [notifMessages, setNotifMessages] = useState(true);
  const [notifPrices, setNotifPrices] = useState(false);

  const displayName = profile?.full_name ?? profile?.email ?? user?.email ?? '—';
  const email = profile?.email ?? user?.email ?? '—';
  const version = nativeApplicationVersion ?? applicationId ?? '1.0.0';

  const handleSignOut = async () => {
    queryClient.clear();
    await signOut();
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <SectionTitle title="Профиль" colors={colors} />
      <View style={styles.profileRow}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>
            {displayName !== '—' ? displayName.charAt(0).toUpperCase() : '?'}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: colors.text }]}>{displayName}</Text>
          <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>{email}</Text>
        </View>
      </View>
      <Divider colors={colors} />

      <SectionTitle title="Уведомления" colors={colors} />
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <Ionicons name="calendar-outline" size={22} color={colors.textSecondary} style={styles.rowIcon} />
        <Text style={[styles.rowLabel, { color: colors.text }]}>Новые брони</Text>
        <Switch
          value={notifBookings}
          onValueChange={setNotifBookings}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      </View>
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <Ionicons name="chatbubble-outline" size={22} color={colors.textSecondary} style={styles.rowIcon} />
        <Text style={[styles.rowLabel, { color: colors.text }]}>Сообщения</Text>
        <Switch
          value={notifMessages}
          onValueChange={setNotifMessages}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      </View>
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <Ionicons name="pricetag-outline" size={22} color={colors.textSecondary} style={styles.rowIcon} />
        <Text style={[styles.rowLabel, { color: colors.text }]}>Изменения цен</Text>
        <Switch
          value={notifPrices}
          onValueChange={setNotifPrices}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      </View>
      <Divider colors={colors} />

      <SectionTitle title="Тема" colors={colors} />
      <View style={[styles.themeRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.themeOption, theme === 'light' && { backgroundColor: colors.primaryMuted }]}
          onPress={() => setTheme('light')}
        >
          <Ionicons name="sunny-outline" size={20} color={theme === 'light' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.themeOptionText, { color: theme === 'light' ? colors.primary : colors.textSecondary }]}>Светлая</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.themeOption, theme === 'dark' && { backgroundColor: colors.primaryMuted }]}
          onPress={() => setTheme('dark')}
        >
          <Ionicons name="moon-outline" size={20} color={theme === 'dark' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.themeOptionText, { color: theme === 'dark' ? colors.primary : colors.textSecondary }]}>Тёмная</Text>
        </TouchableOpacity>
      </View>
      <Divider colors={colors} />

      <SectionTitle title="Приложение" colors={colors} />
      <Row icon="information-circle-outline" label="Версия" value={version} colors={colors} />
      <Row icon="document-text-outline" label="О приложении" onPress={() => {}} colors={colors} />
      <Row icon="bar-chart-outline" label="Аналитика" onPress={() => navigation.navigate('Analytics' as never)} colors={colors} />
      <Divider colors={colors} />

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={22} color={colors.error} style={styles.rowIcon} />
        <Text style={[styles.signOutText, { color: colors.error }]}>Выйти</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 24,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 14,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
  },
  rowValue: {
    fontSize: 14,
    marginTop: 2,
  },
  themeRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: 4,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
