import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../integrations/supabase/client';

interface AuthContextValue {
  session: Session | null;
}

const AuthContext = createContext<AuthContextValue>({ session: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ session }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
