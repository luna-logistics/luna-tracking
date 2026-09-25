import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const { appendMessage, createSendLock } = await import('./support-chat');

const msg = (id: string, created_at: string) => ({ id, created_at, body: id });

describe('appendMessage (send response + Realtime echo)', () => {
  it('shows a message once whichever copy arrives first', () => {
    const m = msg('a', '2026-09-25T10:00:00Z');
    const echoFirst = appendMessage(appendMessage([], m), { ...m });
    const responseFirst = appendMessage(appendMessage([], { ...m }), m);
    expect(echoFirst).toHaveLength(1);
    expect(responseFirst).toHaveLength(1);
  });
  it('keeps two genuine messages with the same text', () => {
    const t = appendMessage(appendMessage([], msg('a', '2026-09-25T10:00:00Z')), { ...msg('b', '2026-09-25T10:00:01Z'), body: 'a' });
    expect(t.map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('keeps chronological order when an echo lands late', () => {
    const t = appendMessage([msg('a', '2026-09-25T10:00:00Z'), msg('c', '2026-09-25T10:00:02Z')], msg('b', '2026-09-25T10:00:01Z'));
    expect(t.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('createSendLock (double Enter / held Enter)', () => {
  it('drops a second send started while the first is in flight', async () => {
    const lock = createSendLock();
    let release!: () => void;
    const send = vi.fn(() => new Promise<string>((r) => { release = () => r('ok'); }));
    const first = lock(send);
    const second = lock(send);           // same frame: must be ignored
    expect(send).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toBe('ok');
    expect(await second).toBeUndefined();
  });
  it('lets the next genuine message through once the first settles (fast typer)', async () => {
    const lock = createSendLock();
    const send = vi.fn(async () => 'ok');
    await lock(send);
    await lock(send);
    await lock(send);
    expect(send).toHaveBeenCalledTimes(3);
  });
  it('releases the lock when a send fails', async () => {
    const lock = createSendLock();
    await expect(lock(async () => { throw new Error('network'); })).rejects.toThrow('network');
    const send = vi.fn(async () => 'ok');
    expect(await lock(send)).toBe('ok');
  });
});
