export interface User {
  id: string;
  email: string;
}

export interface Session {
  user: User;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  done: boolean;
  created_at: string;
  created_by: string;
  author_name: string;
}

export interface Comment {
  id: string;
  task_id: string;
  body: string;
  created_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Every backend failure surfaces as a BackendError with a message safe to show in the UI. */
export class BackendError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'BackendError';
    this.cause = cause;
  }
}

/** What the UI needs from a backend. Implemented by the localStorage demo and by Supabase. */
export interface Backend {
  readonly kind: 'demo' | 'supabase';
  auth: {
    getSession(): Promise<Session | null>;
    onAuthStateChange(callback: (session: Session | null) => void): () => void;
    signIn(email: string, password: string): Promise<Session>;
    signInWithGoogle(): Promise<void>;
    signOut(): Promise<void>;
  };
  tasks: {
    /** One request per page: tasks joined with the author name, plus the total count. */
    list(page: number, pageSize: number): Promise<Page<Task>>;
    get(id: string): Promise<{ task: Task; comments: Comment[] } | null>;
    create(title: string): Promise<Task>;
    setDone(id: string, done: boolean): Promise<void>;
  };
  ai: {
    summarize(taskId: string): Promise<string>;
  };
}
