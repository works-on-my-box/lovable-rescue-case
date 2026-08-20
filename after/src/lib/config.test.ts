import { describe, expect, it } from 'vitest';
import { resolveConfig } from './config';

describe('resolveConfig', () => {
  it('falls back to demo mode when Supabase env is missing or incomplete', () => {
    expect(resolveConfig({}).demoMode).toBe(true);
    expect(resolveConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' }).demoMode).toBe(true);
    expect(resolveConfig({ VITE_SUPABASE_URL: '  ', VITE_SUPABASE_ANON_KEY: 'k' }).demoMode).toBe(true);
  });

  it('uses Supabase when both variables are set', () => {
    const c = resolveConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' });
    expect(c).toEqual({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', demoMode: false });
  });
});
