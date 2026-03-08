import { create } from 'zustand';
import { User, Session } from '@supabase/supabase-js';
import { supabase, Profile } from '@/lib/supabase';

export type SignUpParams = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
};

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
}

interface AuthActions {
  initialize: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: SignUpParams) => Promise<{ data: { user: User | null; session: Session | null }; error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

async function fetchProfile(userId: string, retries = 3): Promise<Profile | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, business_name, telegram_id, email, phone, phone_confirmed_at, subscription_tier, subscription_expires_at, role, is_active, theme, onboarding_survey, created_at, updated_at')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        if (attempt === retries) {
          console.error('Error fetching profile after all retries:', error);
          return null;
        }
        if (attempt === 1 && error.message?.includes('Failed to fetch')) {
          if (import.meta.env.DEV) console.log('Profile fetch failed, retrying... (attempt 1/3)');
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      if (attempt > 1 && import.meta.env.DEV) {
        console.log(`Profile fetched successfully after ${attempt} attempts`);
      }

      return data;
    } catch (error) {
      if (attempt === retries) {
        console.error('Error in fetchProfile after all retries:', error);
        return null;
      }
      if (attempt === 1 && import.meta.env.DEV) {
        console.log('Profile fetch error, retrying... (attempt 1/3)');
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  return null;
}

function computeIsAdmin(profile: Profile | null): boolean {
  return profile?.role === 'admin' && profile?.is_active === true;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,

  initialize: () => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user ?? null;
      let profile: Profile | null = null;
      if (user) {
        profile = await fetchProfile(user.id);
      }
      set({ user, profile, loading: false, isAdmin: computeIsAdmin(profile) });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        const user = session?.user ?? null;
        if (user) {
          const profile = await fetchProfile(user.id);
          set({ user, profile, isAdmin: computeIsAdmin(profile) });
        } else {
          set({ user: null, profile: null, isAdmin: false });
        }
      })();
    });

    return () => subscription.unsubscribe();
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session) return;

    set({ user: data.user });
    let profileData = await fetchProfile(data.user.id);

    if (!profileData) {
      const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const firstName = typeof metadata.first_name === 'string' ? metadata.first_name : undefined;
      const lastName = typeof metadata.last_name === 'string' ? metadata.last_name : undefined;
      const phone = typeof metadata.phone === 'string' ? metadata.phone : undefined;
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || undefined;

      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      const isFirstUser = count === 0;

      const demoEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: newProfile, error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          email: data.user.email,
          role: isFirstUser ? 'admin' : 'user',
          is_active: true,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          phone,
          subscription_tier: 'demo',
          subscription_expires_at: demoEndsAt,
        })
        .select()
        .single();

      if (profileError) {
        console.error('Error creating profile on sign-in:', profileError);
      } else {
        profileData = newProfile;
      }
    }

    if (profileData && profileData.is_active === false) {
      await supabase.auth.signOut();
      throw new Error(
        'Доступ к аккаунту отключён. Обратитесь к администратору для восстановления (support@roomi.pro).'
      );
    }

    const bootstrapEmail = typeof import.meta.env.VITE_BOOTSTRAP_ADMIN_EMAIL === 'string'
      ? (import.meta.env.VITE_BOOTSTRAP_ADMIN_EMAIL as string).trim().toLowerCase()
      : '';
    if (
      profileData &&
      bootstrapEmail &&
      (profileData.email ?? '').toLowerCase() === bootstrapEmail &&
      (profileData.role !== 'admin' || profileData.is_active !== true)
    ) {
      const { data: updated } = await supabase
        .from('profiles')
        .update({ role: 'admin', is_active: true })
        .eq('id', profileData.id)
        .select()
        .single();
      if (updated) profileData = updated;
    }

    set({ profile: profileData, isAdmin: computeIsAdmin(profileData) });
  },

  signUp: async (params: SignUpParams) => {
    const { email, password, firstName, lastName, phone } = params;
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard`,
        data: {
          first_name: firstName,
          last_name: lastName,
          phone: phone ?? undefined,
        },
      },
    });
    if (result.error) throw result.error;

    if (result.data.user && result.data.session) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      let profileData = await fetchProfile(result.data.user.id);

      if (!profileData) {
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });
        const isFirstUser = count === 0;
        const demoEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: newProfile, error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: result.data.user.id,
            email: result.data.user.email,
            role: isFirstUser ? 'admin' : 'user',
            is_active: true,
            subscription_tier: 'demo',
            subscription_expires_at: demoEndsAt,
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

      set({ profile: profileData, isAdmin: computeIsAdmin(profileData) });
    }

    return result;
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    set({ user: null, profile: null, isAdmin: false });
  },

  refreshProfile: async () => {
    const { user } = get();
    if (user) {
      const profileData = await fetchProfile(user.id);
      set({ profile: profileData, isAdmin: computeIsAdmin(profileData) });
    }
  },

  deleteAccount: async () => {
    const { user } = get();
    if (!user) {
      throw new Error('Пользователь не авторизован');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Необходима авторизация');
    }

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

    await get().signOut();
  },
}));

export function useAuth() {
  return useAuthStore();
}
