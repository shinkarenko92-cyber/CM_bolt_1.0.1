/**
 * Контекст авторизации: сессия Supabase, профиль, signIn/signOut.
 * Проверка env, startAutoRefresh после входа, проверка profile.is_active.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { User } from '@supabase/supabase-js';
import { supabase, type Profile } from '../lib/supabase';

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('fetchProfile error:', error);
    return null;
  }
  return data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      Alert.alert(
        'Ошибка конфигурации',
        'Нет ключей Supabase в .env. Добавьте EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY.',
        [{ text: 'OK' }]
      );
      setLoading(false);
      return;
    }

    supabase!.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const p = await fetchProfile(session.user.id);
        setProfile(p);
        if (p && !p.is_active) {
          await supabase!.auth.signOut();
          setUser(null);
          setProfile(null);
          Alert.alert('Аккаунт не активен', 'Вход невозможен.');
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase!.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const p = await fetchProfile(session.user.id);
        setProfile(p);
        if (p && !p.is_active) {
          await supabase!.auth.signOut();
          setUser(null);
          setProfile(null);
          Alert.alert('Аккаунт не активен', 'Вход невозможен.');
        }
      } else {
        setProfile(null);
      }
    });

    return () => subscription!.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.session) {
      supabase.auth.startAutoRefresh();
      const p = await fetchProfile(data.user.id);
      if (p && !p.is_active) {
        await supabase!.auth.signOut();
        throw new Error('Аккаунт не активен.');
      }
      setUser(data.user);
      setProfile(p);
    }
  };

  const signOut = async () => {
    if (supabase) await supabase!.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
