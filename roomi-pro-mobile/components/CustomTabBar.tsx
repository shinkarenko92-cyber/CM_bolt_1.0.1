/**
 * Нижняя панель с кнопкой «+» по центру (между Брони и Сообщения), по макету updated_calendar.
 */
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Pressable, Text } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/useTheme';
import { useAddBooking } from '../contexts/AddBookingContext';

const PLUS_AFTER_INDEX = 2; // после Bookings (0 Dashboard, 1 Calendar, 2 Bookings) — затем Plus — затем Messages, Analytics, Settings

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { openAddBooking } = useAddBooking();

  const leftRoutes = state.routes.slice(0, PLUS_AFTER_INDEX + 1);
  const rightRoutes = state.routes.slice(PLUS_AFTER_INDEX + 1, state.routes.length);

  const renderTab = (route: (typeof state.routes)[0], index: number) => {
    const globalIndex = state.routes.indexOf(route);
    const isFocused = state.index === globalIndex;
    const { options } = descriptors[route.key];
    const color = isFocused ? colors.primary : colors.textSecondary;
    return (
      <TouchableOpacity
        key={route.key}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
        style={styles.tab}
      >
        {options.tabBarIcon?.({ focused: isFocused, color, size: 24 })}
        <Text style={[styles.label, { color }]} numberOfLines={1}>
          {options.title ?? route.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom || 8,
        },
      ]}
    >
      <View style={styles.row}>
        {leftRoutes.map((route, i) => renderTab(route, i))}
        <View style={styles.plusWrap}>
          <Pressable
            style={({ pressed }) => [
              styles.plusBtn,
              { backgroundColor: colors.primary },
              pressed && styles.plusBtnPressed,
            ]}
            onPress={openAddBooking}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </Pressable>
        </View>
        {rightRoutes.map((route, i) => renderTab(route, PLUS_AFTER_INDEX + 1 + i))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  plusWrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: -16,
    minWidth: 56,
  },
  plusBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  plusBtnPressed: {
    opacity: 0.9,
  },
});
