import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { backend } from '../lib/backend';
import type { Comment, Task } from '../lib/types';

type Status =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'missing' }
  | { state: 'ready'; task: Task; comments: Comment[] };

export default function TaskDetail() {
  const { id = '' } = useParams();
  const [status, setStatus] = useState<Status>({ state: 'loading' });
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    let active = true;
    setStatus({ state: 'loading' });
    backend.tasks
      .get(id)
      .then((result) => {
        if (!active) return;
        setStatus(result ? { state: 'ready', ...result } : { state: 'missing' });
      })
      .catch((err: unknown) => {
        if (active) setStatus({ state: 'error', message: err instanceof Error ? err.message : 'Could not load the task.' });
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function handleSummarize() {
    setSummarizing(true);
    setSummaryError(null);
    try {
      setSummary(await backend.ai.summarize(id));
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'AI summary failed.');
    } finally {
      setSummarizing(false);
    }
  }

  if (status.state === 'loading') return <p className="muted">Loading task…</p>;
  if (status.state === 'error')
    return (
      <div className="card">
        <p className="error" role="alert">
          {status.message}
        </p>
        <Link to="/tasks">← All tasks</Link>
      </div>
    );
  if (status.state === 'missing')
    return (
      <div className="card">
        <h1>Task not found</h1>
        <Link to="/tasks">← All tasks</Link>
      </div>
    );

  const { task, comments } = status;
  return (
    <div className="card">
      <p>
        <Link to="/tasks">← All tasks</Link>
      </p>
      <h1>{task.title}</h1>
      <p className="muted">{task.description ?? 'No description'}</p>
      <p className="meta">
        {task.done ? 'Done' : 'Open'} · created by {task.author_name} on {new Date(task.created_at).toLocaleDateString()}
      </p>
      <button onClick={handleSummarize} disabled={summarizing}>
        {summarizing ? 'Summarizing…' : '✨ Summarize with AI'}
      </button>
      {summary && <p className="summary">{summary}</p>}
      {summaryError && (
        <p className="error" role="alert">
          {summaryError}
        </p>
      )}
      <h2>Comments</h2>
      {comments.length === 0 && <p className="muted">No comments yet.</p>}
      <ul className="task-list">
        {comments.map((c) => (
          <li key={c.id} className="task">
            <span className="title">{c.body}</span>
            <span className="meta">{new Date(c.created_at).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
