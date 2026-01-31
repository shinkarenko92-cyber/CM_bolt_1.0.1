/**
 * Настройки: секции Профиль (аватар, имя, email), Уведомления (Switch),
 * Приложение (версия, О приложении), Выйти.
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
import { Ionicons } from '@expo/vector-icons';
import { nativeApplicationVersion, applicationId } from 'expo-application';
import { useAuth } from '../contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { colors } from '../constants/colors';

function Row({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <Ionicons name={icon} size={22} color={colors.textSecondary} style={styles.rowIcon} />
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value != null ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      ) : null}
    </Wrapper>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function Divider() {
  return <View style={styles.divider} />;
}

export function SettingsScreen() {
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionTitle title="Профиль" />
      <View style={styles.profileRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {displayName !== '—' ? displayName.charAt(0).toUpperCase() : '?'}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileEmail}>{email}</Text>
        </View>
      </View>
      <Divider />

      <SectionTitle title="Уведомления" />
      <View style={styles.row}>
        <Ionicons name="calendar-outline" size={22} color={colors.textSecondary} style={styles.rowIcon} />
        <Text style={styles.rowLabel}>Новые брони</Text>
        <Switch
          value={notifBookings}
          onValueChange={setNotifBookings}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      </View>
      <View style={styles.row}>
        <Ionicons name="chatbubble-outline" size={22} color={colors.textSecondary} style={styles.rowIcon} />
        <Text style={styles.rowLabel}>Сообщения</Text>
        <Switch
          value={notifMessages}
          onValueChange={setNotifMessages}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      </View>
      <View style={styles.row}>
        <Ionicons name="pricetag-outline" size={22} color={colors.textSecondary} style={styles.rowIcon} />
        <Text style={styles.rowLabel}>Изменения цен</Text>
        <Switch
          value={notifPrices}
          onValueChange={setNotifPrices}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#fff"
        />
      </View>
      <Divider />

      <SectionTitle title="Приложение" />
      <Row icon="information-circle-outline" label="Версия" value={version} />
      <Row icon="document-text-outline" label="О приложении" onPress={() => {}} />
      <Divider />

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={22} color={colors.error} style={styles.rowIcon} />
        <Text style={styles.signOutText}>Выйти</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingTop: 24,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
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
    backgroundColor: colors.primary,
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
    color: colors.text,
  },
  profileEmail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    color: colors.text,
  },
  rowValue: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
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
    color: colors.error,
  },
});
