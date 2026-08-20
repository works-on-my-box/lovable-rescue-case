import { BackendError, type Backend, type Comment, type Session, type Task } from './types';

/** The subset of the Storage API we need (so tests can pass an in-memory object). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface DemoState {
  session: Session | null;
  tasks: Task[];
  comments: Comment[];
}

export const STORAGE_KEY = 'taskflow.demo.v1';
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SEED_TASKS: Array<[string, string | null, boolean, string]> = [
  ['Set up the Supabase project and tables', 'profiles, tasks, comments + RLS policies', true, 'Maya Chen'],
  ['Design the onboarding flow', 'Three screens max. Skip button on every step.', true, 'Tom Okafor'],
  ['Write the privacy policy page', null, true, 'Priya Nair'],
  ['Connect the custom domain', 'app.taskflow.example → Vercel', false, 'Maya Chen'],
  ['Add task comments', 'Plain text first, markdown later.', true, 'Tom Okafor'],
  ['Invite the beta testers', '12 people from the waitlist', false, 'Priya Nair'],
  ['Fix the login loop after refresh', 'Reported by 3 testers', true, 'Maya Chen'],
  ['Set up error reporting', 'Sentry or just console for now?', false, 'Tom Okafor'],
  ['Weekly summary email', 'Cron + edge function', false, 'Priya Nair'],
  ['Mobile layout pass', 'Task list and detail page', false, 'Maya Chen'],
  ['Export tasks to CSV', null, false, 'Tom Okafor'],
  ['Launch checklist', 'Domain, env vars, backups, status page', false, 'Priya Nair'],
];

function seed(now: number): DemoState {
  const tasks = SEED_TASKS.map(([title, description, done, author], i) => ({
    id: `t${i + 1}`,
    title,
    description,
    done,
    created_at: new Date(now - (SEED_TASKS.length - i) * 3_600_000 * 5).toISOString(),
    created_by: `seed-${author.split(' ')[0].toLowerCase()}`,
    author_name: author,
  }));
  const comments: Comment[] = [
    { id: 'c1', task_id: 't7', body: 'Root cause: RequireAuth redirected before the session was loaded.', created_at: new Date(now - 86_400_000).toISOString() },
    { id: 'c2', task_id: 't7', body: 'Fixed and deployed — please re-test.', created_at: new Date(now - 43_200_000).toISOString() },
    { id: 'c3', task_id: 't4', body: 'DNS is propagating, give it an hour.', created_at: new Date(now - 7_200_000).toISOString() },
  ];
  return { session: null, tasks, comments };
}

export function createLocalBackend(storage: KeyValueStorage, now: () => number = Date.now): Backend {
  const listeners = new Set<(session: Session | null) => void>();

  function read(): DemoState {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as DemoState;
      } catch {
        /* corrupted → reseed */
      }
    }
    const fresh = seed(now());
    write(fresh);
    return fresh;
  }

  function write(state: DemoState) {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function requireSession(state: DemoState): Session {
    if (!state.session) throw new BackendError('You need to sign in first.');
    return state.session;
  }

  const withAuthorLookup = (tasks: Task[]) => [...tasks].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return {
    kind: 'demo',
    auth: {
      async getSession() {
        return read().session;
      },
      onAuthStateChange(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
      async signIn(email, password) {
        await delay(150);
        if (!EMAIL_RE.test(email) || password.length < 6) {
          throw new BackendError('Enter a valid email and a password of at least 6 characters.');
        }
        const state = read();
        state.session = { user: { id: `user-${email.toLowerCase()}`, email } };
        write(state);
        listeners.forEach((cb) => cb(state.session));
        return state.session;
      },
      async signInWithGoogle() {
        throw new BackendError('Google sign-in needs a real Supabase project (demo mode).');
      },
      async signOut() {
        const state = read();
        state.session = null;
        write(state);
        listeners.forEach((cb) => cb(null));
      },
    },
    tasks: {
      async list(page, pageSize) {
        const all = withAuthorLookup(read().tasks);
        const start = (page - 1) * pageSize;
        return { items: all.slice(start, start + pageSize), total: all.length, page, pageSize };
      },
      async get(id) {
        const state = read();
        const task = state.tasks.find((t) => t.id === id);
        if (!task) return null;
        return { task, comments: state.comments.filter((c) => c.task_id === id) };
      },
      async create(title) {
        const state = read();
        const { user } = requireSession(state);
        const trimmed = title.trim();
        if (!trimmed) throw new BackendError('Task title cannot be empty.');
        const task: Task = {
          id: `t${now().toString(36)}`,
          title: trimmed,
          description: null,
          done: false,
          created_at: new Date(now()).toISOString(),
          created_by: user.id,
          author_name: user.email.split('@')[0],
        };
        state.tasks.push(task);
        write(state);
        return task;
      },
      async setDone(id, done) {
        const state = read();
        requireSession(state);
        const task = state.tasks.find((t) => t.id === id);
        if (!task) throw new BackendError('Task not found.');
        task.done = done;
        write(state);
      },
    },
    ai: {
      async summarize(taskId) {
        await delay(400);
        const task = read().tasks.find((t) => t.id === taskId);
        if (!task) throw new BackendError('Task not found.');
        return `(demo summary, no AI call) "${task.title}" is ${task.done ? 'done' : 'still open'}; created by ${task.author_name}.`;
      },
    },
  };
}
