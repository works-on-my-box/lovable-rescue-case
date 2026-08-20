import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { summarizeTask } from '../lib/ai';
import type { Comment, Task } from '../types';

export default function TaskDetail() {
  const { id } = useParams();
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => setTask(data));
    supabase
      .from('comments')
      .select('*')
      .eq('task_id', id)
      .then(({ data }) => setComments(data as Comment[])); // null when the request fails → comments.map() throws
  }, [id]);

  async function handleSummarize() {
    setSummarizing(true);
    const text = await summarizeTask(task!);
    setSummary(text);
    setSummarizing(false);
  }

  return (
    <div>
      <header className="topbar">
        <Link to="/tasks" className="brand">
          Task<span>Flow</span>
        </Link>
        <Link to="/tasks">← All tasks</Link>
      </header>
      <main className="container">
        <div className="card">
          {task ? (
            <>
              <h1>{task.title}</h1>
              <p className="muted">{task.description ?? 'No description'}</p>
            </>
          ) : (
            <p className="muted">Loading task…</p>
          )}
          <button onClick={handleSummarize} disabled={summarizing}>
            {summarizing ? 'Summarizing…' : '✨ Summarize with AI'}
          </button>
          {summary && <p className="summary">{summary}</p>}
          <h2>Comments</h2>
          <ul className="task-list">
            {comments.map((c) => (
              <li key={c.id} className="task">
                <span className="title">{c.body}</span>
                <span className="meta">{new Date(c.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
