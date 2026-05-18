import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { EventAppParticipant } from '@/types/event-app.types';

interface EventAppAuthContextType {
  participant: EventAppParticipant | null;
  loading: boolean;
  error: string | null;
  login: (eventToken: string, identifier: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Record<string, any>) => Promise<void>;
  primaryColor: string;
}

const EventAppAuthContext = createContext<EventAppAuthContextType | null>(null);

const TOKEN_KEY = 'event_app_token';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function callAuthFunction(action: string, payload: Record<string, any> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/event-app-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  return res.json();
}

async function callActionsFunction(action: string, token: string, payload: Record<string, any> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/event-app-actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token, ...payload }),
  });
  return res.json();
}

export function EventAppAuthProvider({
  children,
  eventToken,
}: {
  children: ReactNode;
  eventToken: string;
}) {
  const [participant, setParticipant] = useState<EventAppParticipant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const storageKey = `${TOKEN_KEY}_${eventToken}`;

  // Validate existing session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem(storageKey);
    if (!savedToken) {
      setLoading(false);
      return;
    }

    callAuthFunction('validate', { token: savedToken })
      .then((data) => {
        if (data.success && data.participant) {
          setParticipant(data.participant);
        } else {
          localStorage.removeItem(storageKey);
        }
      })
      .catch(() => {
        localStorage.removeItem(storageKey);
      })
      .finally(() => setLoading(false));
  }, [storageKey]);

  const login = useCallback(
    async (evToken: string, identifier: string) => {
      setError(null);
      const data = await callAuthFunction('login', {
        event_token: evToken,
        identifier,
      });

      if (data.success && data.participant) {
        localStorage.setItem(storageKey, data.token);
        setParticipant(data.participant);
        return { success: true };
      }

      const errMsg = data.error || 'Erro ao fazer login';
      setError(errMsg);
      return { success: false, error: errMsg };
    },
    [storageKey]
  );

  const logout = useCallback(async () => {
    const token = localStorage.getItem(storageKey);
    if (token) {
      await callAuthFunction('logout', { token }).catch(() => {});
    }
    localStorage.removeItem(storageKey);
    setParticipant(null);
  }, [storageKey]);

  const refreshProfile = useCallback(async () => {
    const token = localStorage.getItem(storageKey);
    if (!token) return;

    const data = await callAuthFunction('validate', { token });
    if (data.success && data.participant) {
      setParticipant(data.participant);
    }
  }, [storageKey]);

  const updateProfile = useCallback(
    async (updates: Record<string, any>) => {
      if (!participant) return;
      const data = await callActionsFunction('update_profile', participant.sessionToken, updates);
      if (data.success) {
        await refreshProfile();
      }
    },
    [participant, refreshProfile]
  );

  const primaryColor = participant?.event?.settings?.primaryColor || '#f97316'; // orange-500 default

  return (
    <EventAppAuthContext.Provider
      value={{
        participant,
        loading,
        error,
        login,
        logout,
        refreshProfile,
        updateProfile,
        primaryColor,
      }}
    >
      {children}
    </EventAppAuthContext.Provider>
  );
}

export function useEventAppAuth() {
  const ctx = useContext(EventAppAuthContext);
  if (!ctx) throw new Error('useEventAppAuth must be used within EventAppAuthProvider');
  return ctx;
}

export { callActionsFunction };
