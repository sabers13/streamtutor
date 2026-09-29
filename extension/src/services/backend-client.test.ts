import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackendClient } from './backend-client';

describe('BackendClient', () => {
  let client: BackendClient;

  beforeEach(() => {
    client = new BackendClient('http://localhost:8000');
    client.clearMemoryCache();
    vi.restoreAllMocks();
  });

  it('handles successful sentence analysis and caches response', async () => {
    const mockResponse = {
      text: 'Du weißt doch überhaupt nicht, wovon du redest.',
      estimated_level: 'B1',
      show_help: true,
      translation: "You have absolutely no idea what you're talking about.",
      note: 'wovon = wo(r) + von; reden von + dative',
      important_words: [{ word: 'wovon', meaning: 'what ... about' }],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await client.analyzeSentence('Du weißt doch überhaupt nicht, wovon du redest.');
    expect(result).toEqual(mockResponse);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call should hit in-memory cache and NOT call fetch again!
    const cachedResult = await client.analyzeSentence('Du weißt doch überhaupt nicht, wovon du redest.');
    expect(cachedResult).toEqual(mockResponse);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('handles server errors gracefully without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    const result = await client.analyzeSentence('Du weißt doch überhaupt nicht, wovon du redest.');
    expect(result).toBeNull();
  });

  it('handles network failure gracefully without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection refused'));

    const result = await client.analyzeSentence('Du weißt doch überhaupt nicht, wovon du redest.');
    expect(result).toBeNull();
  });
});
