/**
 * Roomi Pro Mobile: QueryClient + Auth + навигация (Stack + BottomTabs).
 * Toast в корне, header "Roomi Pro" + иконка профиля, push только в dev build (в Expo Go — Alert).
 * Native tabs unstable — откатили на стабильные для Expo SDK 54 (Host undefined fix).
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Alert, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { useTheme } from './contexts/useTheme';
import { LoginScreen } from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { BookingsScreen } from './screens/BookingsScreen';
import { MessagesScreen } from './screens/MessagesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const hasSupabaseEnv =
  typeof process.env.EXPO_PUBLIC_SUPABASE_URL === 'string' &&
  process.env.EXPO_PUBLIC_SUPABASE_URL?.length !== 0 &&
  typeof process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY === 'string' &&
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.length !== 0;

function ConfigMissingScreen() {
  const { colors } = useTheme();
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return (
    <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
      <Text style={[styles.loadingText, { color: colors.text }]}>Нет ключей Supabase в .env</Text>
      <Text style={[styles.loadingText, { color: colors.text, fontSize: 14, marginTop: 8, opacity: 0.9 }]}>
        Добавьте EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY
      </Text>
    </View>
  );
}

const isExpoGo =
  Constants.appOwnership === 'expo' || Constants.appOwnership === 'guest';

async function registerForPushNotificationsAsync(): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require: Expo Go has no Nitro
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return;
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    await Notifications.getExpoPushTokenAsync();
  } catch {
    // ignore
  }
}

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Главная',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{
          title: 'Календарь',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Bookings"
        component={BookingsScreen}
        options={{
          title: 'Бронирования',
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          title: 'Сообщения',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Настройки',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  const expoGoAlertShown = useRef(false);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  useEffect(() => {
    if (__DEV__ && isExpoGo && !expoGoAlertShown.current) {
      expoGoAlertShown.current = true;
      Alert.alert(
        'Уведомления',
        'Для уведомлений используй development build. В Expo Go пушей нет.'
      );
    }
  }, []);

  useEffect(() => {
    if (user && !isExpoGo) {
      registerForPushNotificationsAsync();
    }
  }, [user]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.text }]}>Загрузка...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function AppContent() {
  const { theme } = useTheme();
  if (!hasSupabaseEnv) {
    return (
      <>
        <ConfigMissingScreen />
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      </>
    );
  }
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
      <Toast />
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </AuthProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
});
