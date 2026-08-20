import { createClient } from '@supabase/supabase-js';
import { BackendError, type Backend, type Comment, type Session, type Task } from './types';

// NOTE: written against supabase/schema.sql. The demo repository has no live Supabase project,
// so this adapter is type-checked and reviewed but not exercised by the tests or the GIF.

type TaskRow = Omit<Task, 'author_name'> & { author: { full_name: string | null } | null };

function fail(what: string, error: { message: string } | null | undefined): never {
  throw new BackendError(`${what}: ${error?.message ?? 'unknown error'}`, error);
}

const toSession = (s: { user: { id: string; email?: string } } | null): Session | null =>
  s ? { user: { id: s.user.id, email: s.user.email ?? '' } } : null;

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  title: row.title,
  description: row.description,
  done: row.done,
  created_at: row.created_at,
  created_by: row.created_by,
  author_name: row.author?.full_name ?? 'Unknown',
});

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const supabase = createClient(url, anonKey);

  return {
    kind: 'supabase',
    auth: {
      async getSession() {
        const { data, error } = await supabase.auth.getSession();
        if (error) fail('Could not read the session', error);
        return toSession(data.session);
      },
      onAuthStateChange(callback) {
        const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(toSession(session)));
        return () => data.subscription.unsubscribe();
      },
      async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.session) fail('Sign-in failed', error);
        return toSession(data.session)!;
      },
      async signInWithGoogle() {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          // Always return to the site the user is on (must also be whitelisted in Supabase → Auth → URL Configuration).
          options: { redirectTo: `${window.location.origin}/tasks` },
        });
        if (error) fail('Google sign-in failed', error);
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) fail('Sign-out failed', error);
      },
    },
    tasks: {
      async list(page, pageSize) {
        const from = (page - 1) * pageSize;
        // One query: tasks + author name through the FK join, with an exact count for paging.
        const { data, error, count } = await supabase
          .from('tasks')
          .select('*, author:profiles(full_name)', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) fail('Could not load tasks', error);
        return { items: ((data ?? []) as TaskRow[]).map(toTask), total: count ?? 0, page, pageSize };
      },
      async get(id) {
        const { data, error } = await supabase
          .from('tasks')
          .select('*, author:profiles(full_name), comments(*)')
          .eq('id', id)
          .maybeSingle();
        if (error) fail('Could not load the task', error);
        if (!data) return null;
        const { comments, ...row } = data as TaskRow & { comments: Comment[] };
        return { task: toTask(row), comments };
      },
      async create(title) {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) fail('You need to sign in first', authError);
        const { data, error } = await supabase
          .from('tasks')
          .insert({ title: title.trim(), created_by: auth.user.id })
          .select('*, author:profiles(full_name)')
          .single();
        if (error) fail('Could not create the task', error);
        return toTask(data as TaskRow);
      },
      async setDone(id, done) {
        const { error } = await supabase.from('tasks').update({ done }).eq('id', id);
        if (error) fail('Could not update the task', error);
      },
    },
    ai: {
      async summarize(taskId) {
        const { data, error } = await supabase.functions.invoke<{ summary?: string; error?: string }>(
          'summarize-task',
          { body: { taskId } },
        );
        if (error) fail('AI summary failed', error);
        if (!data?.summary) throw new BackendError(`AI summary failed: ${data?.error ?? 'empty response'}`);
        return data.summary;
      },
    },
  };
}
