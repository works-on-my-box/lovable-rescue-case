import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  // The session is loaded asynchronously, but there is no "loading" state here:
  // on the first render session is still null → redirect to /login (even for signed-in users).
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
