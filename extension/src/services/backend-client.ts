import {
  AnalyzeSentenceRequest,
  AnalyzeSentenceResponse,
  LookupWordResponse,
  SaveFlashcardRequest,
  SaveFlashcardResponse,
} from '../types';
import { canonicalTextForMatch, normalizeSubtitleText } from '../utils/normalizer';

export class BackendClient {
  private memoryCache = new Map<string, AnalyzeSentenceResponse>();
  private defaultBackendUrl = 'http://localhost:8000';

  constructor(backendUrl?: string) {
    if (backendUrl) {
      this.defaultBackendUrl = backendUrl.replace(/\/+$/, '');
    }
  }

  setBackendUrl(url: string) {
    this.defaultBackendUrl = url.replace(/\/+$/, '');
  }

  private getCacheKey(
    text: string,
    previous?: string,
    next?: string,
    userLevel?: string,
    threshold?: string,
    aiEnabled?: boolean
  ): string {
    const t = canonicalTextForMatch(text);
    const p = previous ? canonicalTextForMatch(previous) : '';
    const n = next ? canonicalTextForMatch(next) : '';
    return `${t}__${p}__${n}__${userLevel || 'A2'}__${threshold || 'B1'}__ai:${aiEnabled !== false}`;
  }

  async checkHealth(backendUrl?: string): Promise<{ ok: boolean; data?: any; error?: string }> {
    const base = (backendUrl || this.defaultBackendUrl).replace(/\/+$/, '');
    try {
      const response = await fetch(`${base}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
      const data = await response.json();
      return { ok: true, data };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to connect to backend' };
    }
  }

  async analyzeSentence(
    text: string,
    options?: {
      previous?: string;
      next?: string;
      userLevel?: string;
      threshold?: string;
      backendUrl?: string;
      aiEnabled?: boolean;
    }
  ): Promise<AnalyzeSentenceResponse | null> {
    const cleanText = normalizeSubtitleText(text);
    if (!cleanText) return null;

    const userLevel = options?.userLevel || 'A2';
    const threshold = options?.threshold || 'B1';
    const aiEnabled = options?.aiEnabled !== false;
    const backendUrl = (options?.backendUrl || this.defaultBackendUrl).replace(/\/+$/, '');

    const cacheKey = this.getCacheKey(cleanText, options?.previous, options?.next, userLevel, threshold, aiEnabled);
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey)!;
    }

    const payload: AnalyzeSentenceRequest = {
      text: cleanText,
      previous: options?.previous,
      next: options?.next,
      user_level: userLevel,
      threshold: threshold,
      ai_enabled: aiEnabled,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${backendUrl}/analyze-sentence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[GermanTutor] Backend returned HTTP ${response.status}: ${response.statusText}`);
        return null;
      }

      const data: AnalyzeSentenceResponse = await response.json();
      this.memoryCache.set(cacheKey, data);
      return data;
    } catch (err) {
      console.warn('[GermanTutor] Error requesting sentence analysis from backend:', err);
      return null;
    }
  }

  async explainSentence(
    text: string,
    options?: {
      previous?: string;
      next?: string;
      userLevel?: string;
      backendUrl?: string;
    }
  ): Promise<string | null> {
    const cleanText = normalizeSubtitleText(text);
    if (!cleanText) return null;

    const backendUrl = (options?.backendUrl || this.defaultBackendUrl).replace(/\/+$/, '');
    const payload = {
      text: cleanText,
      previous: options?.previous,
      next: options?.next,
      user_level: options?.userLevel || 'A2',
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(`${backendUrl}/explain-sentence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[GermanTutor] Explain returned HTTP ${response.status}`);
        return null;
      }

      const data = await response.json();
      return data.explanation || null;
    } catch (err) {
      console.warn('[GermanTutor] Error requesting explanation from backend:', err);
      return null;
    }
  }

  async lookupWord(word: string, backendUrl?: string): Promise<LookupWordResponse | null> {
    const clean = word.trim().replace(/^[.,!?:;"'()«»]+|[.,!?:;"'()«»]+$/g, '');
    if (!clean) return null;

    const cacheKey = `word::${clean.toLowerCase()}`;
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey) as any;
    }

    const base = (backendUrl || this.defaultBackendUrl).replace(/\/+$/, '');
    try {
      const response = await fetch(`${base}/lookup-word?word=${encodeURIComponent(clean)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;
      const data: LookupWordResponse = await response.json();
      this.memoryCache.set(cacheKey, data as any);
      return data;
    } catch (err) {
      console.warn('[GermanTutor] Error looking up word:', err);
      return null;
    }
  }

  async saveFlashcard(
    req: SaveFlashcardRequest,
    backendUrl?: string
  ): Promise<SaveFlashcardResponse | null> {
    const base = (backendUrl || this.defaultBackendUrl).replace(/\/+$/, '');
    try {
      const response = await fetch(`${base}/save-flashcard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(req),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      console.warn('[GermanTutor] Error saving flashcard:', err);
      return null;
    }
  }

  async getFlashcardCount(backendUrl?: string): Promise<number> {
    const base = (backendUrl || this.defaultBackendUrl).replace(/\/+$/, '');
    try {
      const response = await fetch(`${base}/flashcard-count`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return 0;
      const data = await response.json();
      return data.count ?? 0;
    } catch {
      return 0;
    }
  }

  getExportUrl(format: string = 'csv', backendUrl?: string): string {
    const base = (backendUrl || this.defaultBackendUrl).replace(/\/+$/, '');
    return `${base}/export-flashcards?format=${encodeURIComponent(format)}`;
  }

  async clearFlashcards(backendUrl?: string): Promise<boolean> {
    const base = (backendUrl || this.defaultBackendUrl).replace(/\/+$/, '');
    try {
      const response = await fetch(`${base}/flashcards`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  clearMemoryCache() {
    this.memoryCache.clear();
  }
}

export const backendClient = new BackendClient();
