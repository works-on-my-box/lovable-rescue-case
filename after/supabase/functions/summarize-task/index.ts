// Supabase Edge Function (Deno): summarizes a task for the signed-in user.
// Fixed vs. before: CORS headers + OPTIONS preflight, auth check, input validation, explicit error JSON.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // tighten to your domain in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    // Client scoped to the caller's JWT → RLS decides what they can read.
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { taskId } = await req.json().catch(() => ({}));
    if (typeof taskId !== 'string') return json({ error: 'taskId is required' }, 400);

    const { data: task, error } = await supabase.from('tasks').select('title, description').eq('id', taskId).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!task) return json({ error: 'Task not found' }, 404);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ error: 'OPENAI_API_KEY is not set for this function' }, 500);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `Summarize this task in one sentence:\n${task.title}\n${task.description ?? ''}` }],
      }),
    });
    if (!res.ok) return json({ error: `Model request failed (${res.status})` }, 502);
    const completion = await res.json();
    return json({ summary: completion.choices?.[0]?.message?.content ?? '' });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
