import { describe, expect, it } from 'vitest';
import { createLocalBackend, type KeyValueStorage } from './backend.local';

function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

describe('local (demo) backend', () => {
  it('rejects bad credentials and signs in with valid ones', async () => {
    const backend = createLocalBackend(memoryStorage());
    await expect(backend.auth.signIn('nope', '123')).rejects.toThrow(/valid email/);
    expect(await backend.auth.getSession()).toBeNull();

    const session = await backend.auth.signIn('ana@example.com', 'secret123');
    expect(session.user.email).toBe('ana@example.com');
    expect(await backend.auth.getSession()).toEqual(session);
  });

  it('paginates the seeded tasks with a total count', async () => {
    const backend = createLocalBackend(memoryStorage());
    const first = await backend.tasks.list(1, 10);
    const second = await backend.tasks.list(2, 10);
    expect(first.items).toHaveLength(10);
    expect(first.total).toBe(12);
    expect(second.items).toHaveLength(2);
    // newest first
    expect(first.items[0].created_at > first.items[9].created_at).toBe(true);
  });

  it('requires a session to create a task, then lists it first', async () => {
    let clock = 1_700_000_000_000;
    const backend = createLocalBackend(memoryStorage(), () => clock);
    await expect(backend.tasks.create('Ship it')).rejects.toThrow(/sign in/);

    await backend.auth.signIn('ana@example.com', 'secret123');
    clock += 60_000;
    const task = await backend.tasks.create('  Ship it  ');
    expect(task).toMatchObject({ title: 'Ship it', done: false, author_name: 'ana' });

    const page = await backend.tasks.list(1, 10);
    expect(page.items[0].id).toBe(task.id);
    expect(page.total).toBe(13);

    await backend.tasks.setDone(task.id, true);
    expect((await backend.tasks.get(task.id))?.task.done).toBe(true);
  });
});
