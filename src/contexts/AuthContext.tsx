import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, Profile } from '../lib/supabase';

export type SignUpParams = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
};

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: SignUpParams) => Promise<{ data: { user: User | null }; error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string, retries = 3): Promise<Profile | null> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (error) {
          // Если это последняя попытка, логируем ошибку
          if (attempt === retries) {
            console.error('Error fetching profile after all retries:', error);
            return null;
          }
          // Логируем только первую попытку, чтобы не засорять консоль
          if (attempt === 1 && error.message?.includes('Failed to fetch')) {
            console.log('Profile fetch failed, retrying... (attempt 1/3)');
          }
          // Иначе ждем и повторяем
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        // Если была ошибка, но retry успешен, не логируем ошибку
        if (attempt > 1) {
          console.log(`Profile fetched successfully after ${attempt} attempts`);
        }

        return data;
      } catch (error) {
        // Если это последняя попытка, логируем ошибку
        if (attempt === retries) {
          console.error('Error in fetchProfile after all retries:', error);
          return null;
        }
        // Логируем только первую попытку
        if (attempt === 1) {
          console.log('Profile fetch error, retrying... (attempt 1/3)');
        }
        // Иначе ждем и повторяем
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    return null;
  };

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const profileData = await fetchProfile(session.user.id);
        setProfile(profileData);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setUser(session?.user ?? null);
        if (session?.user) {
          const profileData = await fetchProfile(session.user.id);
          setProfile(profileData);
        } else {
          setProfile(null);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.session) {
      setUser(data.user);
      const profileData = await fetchProfile(data.user.id);
      
      // Проверяем, что профиль активен
      if (profileData && profileData.is_active === false) {
        await supabase.auth.signOut();
        throw new Error('Аккаунт был удалён. Вход невозможен.');
      }
      
      setProfile(profileData);
    }
  };

  const signUp = async (params: SignUpParams) => {
    const { email, password, firstName, lastName, phone } = params;
    const result = await supabase.auth.signUp({ email, password });
    if (result.error) throw result.error;

    if (result.data.user) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      let profileData = await fetchProfile(result.data.user.id);

      if (!profileData) {
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });
        const isFirstUser = count === 0;
        const { data: newProfile, error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: result.data.user.id,
            email: result.data.user.email,
            role: isFirstUser ? 'admin' : 'user',
            is_active: true,
          })
          .select()
          .single();
        if (profileError) {
          console.error('Error creating profile:', profileError);
        } else {
          profileData = newProfile;
        }
      }

      if (profileData && (firstName != null || lastName != null || phone != null)) {
        const updates: { first_name?: string; last_name?: string; full_name?: string; phone?: string } = {};
        if (firstName != null) updates.first_name = firstName;
        if (lastName != null) updates.last_name = lastName;
        if (phone != null) updates.phone = phone;
        if (firstName != null && lastName != null) updates.full_name = `${firstName} ${lastName}`.trim();
        const { data: updated } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', result.data.user.id)
          .select()
          .single();
        if (updated) profileData = updated;
      }

      setProfile(profileData);
    }

    return result;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
  };

  const deleteAccount = async () => {
    if (!user) {
      throw new Error('Пользователь не авторизован');
    }

    try {
      // Получаем сессию для передачи в Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Необходима авторизация');
      }

      // Вызываем Edge Function для полного удаления аккаунта
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/delete-user-account`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Неизвестная ошибка' }));
        throw new Error(errorData.error || `Ошибка ${response.status}`);
      }

      // После успешного удаления выходим из системы
      await signOut();
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  };

  const isAdmin = profile?.role === 'admin' && profile?.is_active === true;

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, signIn, signUp, signOut, refreshProfile, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
