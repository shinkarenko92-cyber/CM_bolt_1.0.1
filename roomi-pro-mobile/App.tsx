/**
 * Roomi Pro Mobile: QueryClient + Auth + навигация (Stack / Bottom Tabs).
 * SplashScreen.preventAutoHideAsync при старте, hideAsync после загрузки auth.
 */
import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginScreen } from './screens/LoginScreen';
import { ObjectsScreen } from './screens/ObjectsScreen';
import { BookingsScreen } from './screens/BookingsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { colors } from './constants/colors';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const hasSupabaseEnv =
  typeof process.env.EXPO_PUBLIC_SUPABASE_URL === 'string' &&
  process.env.EXPO_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY === 'string' &&
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.length > 0;

function ConfigMissingScreen() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return (
    <View style={styles.loadingContainer}>
      <Text style={styles.loadingText}>Нет ключей Supabase в .env</Text>
      <Text style={[styles.loadingText, { fontSize: 14, marginTop: 8, opacity: 0.9 }]}>
        Добавьте EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY
      </Text>
    </View>
  );
}

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.backgroundDark },
        headerTintColor: '#fff',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background },
      }}
    >
      <Tab.Screen name="Objects" component={ObjectsScreen} options={{ title: 'Объекты' }} />
      <Tab.Screen name="Bookings" component={BookingsScreen} options={{ title: 'Бронирования' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Настройки' }} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Загрузка...</Text>
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

  return <MainTabs />;
}

export default function App() {
  if (!hasSupabaseEnv) {
    return (
      <>
        <ConfigMissingScreen />
        <StatusBar style="light" />
      </>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
      <StatusBar style="light" />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
  },
});
