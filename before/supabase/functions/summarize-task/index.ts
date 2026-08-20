// Supabase Edge Function (Deno) as generated: no CORS headers, no OPTIONS preflight, no error handling.
import OpenAI from 'https://esm.sh/openai@4';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

Deno.serve(async (req) => {
  const { title, description } = await req.json();
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: `Summarize this task in one sentence:\n${title}\n${description ?? ''}` }],
  });
  return new Response(JSON.stringify({ summary: completion.choices[0].message.content }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
