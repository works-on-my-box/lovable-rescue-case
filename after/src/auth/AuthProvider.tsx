import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { backend } from '../lib/backend';
import type { Session } from '../lib/types';

interface AuthState {
  session: Session | null;
  /** true until the stored session has been read — RequireAuth waits for this instead of redirecting. */
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    let active = true;
    backend.auth
      .getSession()
      .then((session) => active && setState({ session, loading: false }))
      .catch(() => active && setState({ session: null, loading: false }));
    const unsubscribe = backend.auth.onAuthStateChange((session) => {
      if (active) setState({ session, loading: false });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
