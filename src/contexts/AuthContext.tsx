import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '../lib/database.types';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isCoach: boolean;
  canManagePrograms: boolean;
  signIn: (email: string, password: string) => Promise<{ data?: any; error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    data?: {
      fullName?: string;
      role?: 'admin' | 'coach' | 'trainee';
      coachId?: string;
      coachCode?: string;
      gender?: string;
      birthDate?: string;
      phone?: string;
      avatarUrl?: string;
    }
  ) => Promise<{ data?: { user: User | null; session: Session | null } | null; error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // ... (keep fetchProfile and fetchProfileDirect as is, omitted for brevity in tool call if possible, but I must match exact lines to replace)
  // Actually I should just replace the interface and the signUp implementation and isAdmin logic.
  // I will use multiple replace chunks.


  const fetchProfile = async (userId: string) => {
    try {
      console.log('AuthContext: fetchProfile starting for:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }
      console.log('AuthContext: fetchProfile complete:', data);
      return data;
    } catch (err) {
      console.error('AuthContext: fetchProfile exception:', err);
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
    let mounted = true;
    
    // Use native fetch for profile to avoid Supabase client issues
    const fetchProfileDirect = async (userId: string, accessToken: string) => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        const response = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          }
        );
        
        if (!response.ok) return null;
        const data = await response.json();
        return data?.[0] || null;
      } catch {
        return null;
      }
    };

    // ONLY use onAuthStateChange - it fires immediately with current session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log('AuthContext: Auth state changed:', _event, !!session);
        
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user && session.access_token) {
          const profileData = await fetchProfileDirect(session.user.id, session.access_token);
          if (mounted) setProfile(profileData);
        } else {
          setProfile(null);
        }
        
        setLoading(false);
      }
    );

    // Fallback timeout in case onAuthStateChange doesn't fire
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.log('AuthContext: Timeout - setting loading to false');
        setLoading(false);
      }
    }, 3000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error: error as Error | null };
  };

  const signUp = async (
    email: string, 
    password: string, 
    data?: {
      fullName?: string;
      role?: 'admin' | 'coach' | 'trainee';
      coachId?: string;
      coachCode?: string;
      gender?: string;
      birthDate?: string;
      phone?: string;
      avatarUrl?: string;
    }
  ) => {
    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: data?.fullName,
          role: data?.role ?? 'trainee',
          coach_id: data?.coachId,
          coach_code: data?.coachCode,
          gender: data?.gender,
          birth_date: data?.birthDate,
          phone: data?.phone,
          avatar_url: data?.avatarUrl,
        },
      },
    });
    return { data: authData, error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const value: AuthContextType = {
    user,
    profile,
    session,
    loading,
    isAdmin: profile?.is_admin || profile?.role === 'admin' || false,
    isCoach: profile?.role === 'coach' || false,
    canManagePrograms: (profile?.role === 'admin' || profile?.is_admin || profile?.role === 'coach') || false,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
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
