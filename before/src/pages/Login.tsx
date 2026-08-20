import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // The result ({ data, error }) is ignored — supabase-js never throws on auth errors,
    // so a failed sign-in still lands on /tasks (which bounces back here).
    await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    navigate('/tasks');
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Redirect URL copied from the Lovable preview — production users come back to the wrong site.
      options: { redirectTo: 'https://preview--taskflow.lovable.app/tasks' },
    });
  };

  return (
    <div className="container">
      <div className="card auth-card">
        <h1>
          Task<span style={{ color: '#4f46e5' }}>Flow</span> — Sign in
        </h1>
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <div className="stack" style={{ marginTop: 16 }}>
            <button type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" className="secondary" onClick={handleGoogle}>
              Continue with Google
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
