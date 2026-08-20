import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { backend } from '../lib/backend';
import type { Page, Task } from '../lib/types';

const PAGE_SIZE = 10;

export default function Tasks() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Task> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await backend.tasks.list(page, PAGE_SIZE));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tasks.');
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      await backend.tasks.create(title);
      setTitle('');
      setPage(1);
    });
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="card">
      <h1>Team tasks</h1>
      <form onSubmit={handleCreate} className="row">
        <input
          type="text"
          placeholder="New task…"
          aria-label="New task"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          Add
        </button>
      </form>

      {error && (
        <div className="error" role="alert">
          {error}{' '}
          <button className="link" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {!data && !error && <p className="muted">Loading tasks…</p>}
      {data && data.items.length === 0 && <p className="muted">No tasks yet — add the first one above.</p>}

      {data && (
        <ul className="task-list">
          {data.items.map((task) => (
            <li key={task.id} className={`task${task.done ? ' done' : ''}`}>
              <input
                type="checkbox"
                checked={task.done}
                aria-label={`Mark "${task.title}" ${task.done ? 'open' : 'done'}`}
                disabled={busy}
                onChange={() => run(() => backend.tasks.setDone(task.id, !task.done))}
              />
              <Link className="title" to={`/tasks/${task.id}`}>
                {task.title}
              </Link>
              <span className="meta">{task.author_name}</span>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > data.pageSize && (
        <div className="pager">
          <button className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Previous
          </button>
          <span className="meta">
            Page {page} of {pageCount} · {data.total} tasks
          </span>
          <button className="secondary" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
