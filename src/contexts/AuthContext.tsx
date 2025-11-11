import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, Profile } from '../lib/supabase';

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ data: { user: User | null }; error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in fetchProfile:', error);
      return null;
    }
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
      setProfile(profileData);
    }
  };

  const signUp = async (email: string, password: string) => {
    const result = await supabase.auth.signUp({ email, password });
    if (result.error) throw result.error;

    if (result.data.user) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if profile exists
      let profileData = await fetchProfile(result.data.user.id);

      // If no profile exists, create one
      if (!profileData) {
        // Check if this is the first user
        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        const isFirstUser = count === 0;

        // Create profile
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

      setProfile(profileData);
    }

    return result;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
  };

  const isAdmin = profile?.role === 'admin' && profile?.is_active === true;

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
