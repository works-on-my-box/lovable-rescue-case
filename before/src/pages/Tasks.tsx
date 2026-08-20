import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import type { Task } from '../types';

export default function Tasks() {
  const { session } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    // Loads every task at once (no pagination) and never looks at `error`.
    const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
    setTasks(data); // `data` is null when the request fails → tasks.map() below throws → white screen

    // One extra request per task just to display the author's name (N+1).
    for (const task of data) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', task.created_by)
        .single();
      task.author_name = profile?.full_name ?? 'Unknown';
    }
    setTasks([...data]);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    await supabase.from('tasks').insert({ title, created_by: session?.user.id });
    setTitle('');
    loadTasks();
  }

  async function toggleDone(task: Task) {
    await supabase.from('tasks').update({ done: !task.done }).eq('id', task.id);
    loadTasks();
  }

  return (
    <div>
      <header className="topbar">
        <span className="brand">
          Task<span>Flow</span>
        </span>
        <span className="muted">{session?.user.email}</span>
      </header>
      <main className="container">
        <div className="card">
          <h1>Team tasks</h1>
          <form onSubmit={handleCreate} className="row">
            <input
              type="text"
              placeholder="New task…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <button type="submit">Add</button>
          </form>
          <ul className="task-list">
            {tasks.map((task) => (
              <li key={task.id} className={`task${task.done ? ' done' : ''}`}>
                <input type="checkbox" checked={task.done} onChange={() => toggleDone(task)} />
                <Link className="title" to={`/tasks/${task.id}`}>
                  {task.title}
                </Link>
                <span className="meta">{task.author_name}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
