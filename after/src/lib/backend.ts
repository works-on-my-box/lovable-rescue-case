import { config } from './config';
import { createLocalBackend } from './backend.local';
import { createSupabaseBackend } from './backend.supabase';
import type { Backend } from './types';

// Demo mode (no VITE_SUPABASE_* set) keeps everything in localStorage; otherwise talk to Supabase.
export const backend: Backend = config.demoMode
  ? createLocalBackend(window.localStorage)
  : createSupabaseBackend(config.supabaseUrl!, config.supabaseAnonKey!);
