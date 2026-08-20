export interface AppConfig {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  /** true when Supabase is not configured → the app runs on localStorage. */
  demoMode: boolean;
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Pure function over the env object so it can be unit-tested. Only VITE_* variables reach the browser. */
export function resolveConfig(env: Record<string, unknown>): AppConfig {
  const supabaseUrl = str(env.VITE_SUPABASE_URL);
  const supabaseAnonKey = str(env.VITE_SUPABASE_ANON_KEY);
  return { supabaseUrl, supabaseAnonKey, demoMode: !supabaseUrl || !supabaseAnonKey };
}

export const config = resolveConfig(import.meta.env);
