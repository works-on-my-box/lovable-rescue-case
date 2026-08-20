export interface Task {
  id: string;
  title: string;
  description: string | null;
  done: boolean;
  created_at: string;
  created_by: string;
  author_name?: string;
}

export interface Comment {
  id: string;
  task_id: string;
  body: string;
  created_at: string;
}
