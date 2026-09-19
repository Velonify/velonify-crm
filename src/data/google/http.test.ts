import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthExpiredError, GoogleApiError } from '../errors';
import { googleRequest } from './http';

const token = async () => 'token';
const beschreibe = (status: number, meldung: string) => `${status}: ${meldung}`;
const antwort = (status: number, body = '{}') => new Response(body, { status });

function fetchGibt(...antworten: Response[]) {
  const fake = vi.fn<typeof fetch>();
  for (const a of antworten) fake.mockResolvedValueOnce(a);
  vi.stubGlobal('fetch', fake);
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('googleRequest', () => {
  it('retries after a rate limit and returns the later answer', async () => {
    vi.useFakeTimers();
    const fake = fetchGibt(antwort(429, '{}'), antwort(200, '{"ok":true}'));
    const laeuft = googleRequest<{ ok: boolean }>(token, 'https://x', {}, beschreibe);
    await vi.advanceTimersByTimeAsync(1200);
    await expect(laeuft).resolves.toEqual({ ok: true });
    expect(fake).toHaveBeenCalledTimes(2);
  });

  it('gives up after three retries and explains the rate limit', async () => {
    vi.useFakeTimers();
    const fake = fetchGibt(...Array.from({ length: 4 }, () => antwort(429, '{}')));
    const laeuft = googleRequest(token, 'https://x', {}, beschreibe).catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(20_000);
    const fehler = await laeuft;
    expect(fehler).toBeInstanceOf(GoogleApiError);
    expect((fehler as GoogleApiError).message).toMatch(/keine weiteren Anfragen/);
    expect(fake).toHaveBeenCalledTimes(4);
  });

  it('does not retry a plain error and never retries an expired login', async () => {
    const fake = fetchGibt(antwort(404, '{"error":{"message":"weg"}}'));
    await expect(googleRequest(token, 'https://x', {}, beschreibe)).rejects.toThrow('404: weg');
    expect(fake).toHaveBeenCalledTimes(1);

    fetchGibt(antwort(401, '{}'));
    await expect(googleRequest(token, 'https://x', {}, beschreibe)).rejects.toBeInstanceOf(AuthExpiredError);
  });
});
