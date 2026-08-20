import type { Task } from '../types';

// Calls the "summarize-task" Supabase Edge Function.
export async function summarizeTask(task: Task): Promise<string> {
  // SUPABASE_URL has no VITE_ prefix, so Vite never exposes it → the URL becomes "undefined/functions/v1/…".
  const res = await fetch(`${import.meta.env.SUPABASE_URL}/functions/v1/summarize-task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: task.title, description: task.description }),
  });
  // No res.ok check, no network/CORS error handling, no timeout.
  const json = await res.json();
  return json.summary;
}
