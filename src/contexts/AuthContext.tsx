import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'cs' | 'comercial' | 'closer' | 'sdr' | 'geral' | 'user';
  team: 'cs' | 'comercial' | 'marketing' | 'suporte' | 'admin' | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  auth_user_id: string | null;
  whatsapp_instance_id: string | null;
  google_calendar_connected: boolean;
  google_calendar_watch_channel_id: string | null;
  google_calendar_watch_expiration: string | null;
  focus_mode_enabled: boolean;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  teamMember: TeamMember | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string, role: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isCS: boolean;
  isComercial: boolean;
  canAccessSettings: boolean;
  canAccessHR: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [teamMember, setTeamMember] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const sessionRef = useRef<Session | null>(null);

  // Busca teamMember via select direto (mais rápido que RPC — sem overhead de function call)
  const fetchTeamMember = useCallback(async (email: string): Promise<TeamMember | null> => {
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, email, name, role, team, phone, avatar_url, is_active, auth_user_id, whatsapp_instance_id, google_calendar_connected, google_calendar_watch_channel_id, google_calendar_watch_expiration, focus_mode_enabled, created_at')
        .eq('email', email)
        .limit(1)
        .single();

      if (error) throw error;
      return data as TeamMember;
    } catch (err) {
      console.error('[AuthContext] fetchTeamMember error:', err);
      return null;
    }
  }, []);

  const linkAuthUser = useCallback(async (authUserId: string, email: string) => {
    try {
      await supabase
        .from('team_members')
        .update({ auth_user_id: authUserId })
        .eq('email', email)
        .is('auth_user_id', null);
    } catch {
      // silencioso — não é crítico
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Flag para diferenciar login real de token refresh (SIGNED_IN após TOKEN_REFRESHED)
    let hasInitiallySignedIn = false;

    // 1. Inicialização: getSession() lê do localStorage (sem rede) — rápido e determinístico
    const initAuth = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();

      if (!isMounted) return;

      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      sessionRef.current = initialSession;

      if (initialSession?.user?.email) {
        hasInitiallySignedIn = true; // Já tem sessão — próximos SIGNED_IN são refreshes
        const tm = await fetchTeamMember(initialSession.user.email);
        if (isMounted && tm) {
          setTeamMember(tm);
        }
      }

      if (isMounted) {
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      // INITIAL_SESSION já foi tratado por initAuth() acima — ignorar
      if (event === 'INITIAL_SESSION') return;

      // TOKEN_REFRESHED: só atualizar session/user internamente, sem re-render pesado
      // NÃO setar state de user/session aqui — o token já está atualizado no client
      if (event === 'TOKEN_REFRESHED') {
        // Atualizar refs internas silenciosamente (sem re-render)
        sessionRef.current = newSession;
        return;
      }

      // SIGNED_IN após TOKEN_REFRESHED: é só o refresh, não um login real
      // Só processar SIGNED_IN se for o primeiro login da sessão
      if (event === 'SIGNED_IN') {
        if (hasInitiallySignedIn) {
          // Refresh de token — session já atualizada, nada mais a fazer
          return;
        }
        hasInitiallySignedIn = true;

        console.log('[AuthContext] Auth event: SIGNED_IN (primeiro login)');
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user?.email) {
          const tm = await fetchTeamMember(newSession.user.email);
          if (isMounted && tm) {
            setTeamMember(tm);
            linkAuthUser(newSession.user.id, newSession.user.email); // fire-and-forget
          }
        }
        if (isMounted) setLoading(false);
        return;
      }

      // PASSWORD_RECOVERY: user clicked reset link from email
      if (event === 'PASSWORD_RECOVERY') {
        console.log('[AuthContext] Auth event: PASSWORD_RECOVERY');
        setIsPasswordRecovery(true);
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
        // Redirect to reset password page
        window.location.href = '/reset-password';
        return;
      }

      if (event === 'SIGNED_OUT') {
        console.log('[AuthContext] Auth event: SIGNED_OUT');
        hasInitiallySignedIn = false;
        setIsPasswordRecovery(false);
        setSession(null);
        setUser(null);
        setTeamMember(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchTeamMember, linkAuthUser]);

  // Health check: ao voltar pra aba, Supabase auto-refresh já cuida do token.
  // Só precisamos forçar logout se a sessão sumiu completamente (ex: storage limpo).
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      // getSession() retorna do cache local (rápido) — se a session existir,
      // o auto-refresh do Supabase cuida do resto. Não chamar refreshSession() manualmente.
      supabase.auth.getSession().then(({ data, error }) => {
        if (error || !data.session) {
          console.warn('[AuthContext] Sessão perdida ao retornar à aba');
          setUser(null);
          setSession(null);
          setTeamMember(null);
        }
      }).catch(() => {});
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, name: string, role: string = 'geral') => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role }
      }
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setTeamMember(null);
  };

  const isAdmin = teamMember?.role === 'admin';
  const isCS = teamMember?.role === 'cs' || teamMember?.team === 'cs';
  const isComercial = teamMember?.role === 'comercial' || teamMember?.role === 'closer' || teamMember?.role === 'sdr' || teamMember?.team === 'comercial';
  const canAccessSettings = teamMember?.role === 'admin' || teamMember?.role === 'comercial';
  const canAccessHR = teamMember?.role !== 'closer' && teamMember?.role !== 'sdr';

  return (
    <AuthContext.Provider value={{
      user,
      session,
      teamMember,
      loading,
      isPasswordRecovery,
      signIn,
      signUp,
      signOut,
      isAdmin,
      isCS,
      isComercial,
      canAccessSettings,
      canAccessHR,
    }}>
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
