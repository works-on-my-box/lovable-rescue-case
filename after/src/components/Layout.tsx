import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { backend } from '../lib/backend';

export function DemoBanner() {
  if (backend.kind !== 'demo') return null;
  return (
    <div className="banner" data-testid="demo-banner">
      Demo mode — no Supabase configured, data stays in your browser (localStorage). Set{' '}
      <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to use a real backend.
    </div>
  );
}

export default function Layout() {
  const { session } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await backend.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div>
      <DemoBanner />
      <header className="topbar">
        <Link to="/tasks" className="brand">
          Task<span>Flow</span>
        </Link>
        <span className="row">
          <span className="muted">{session?.user.email}</span>
          <button className="secondary" onClick={signOut}>
            Sign out
          </button>
        </span>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
