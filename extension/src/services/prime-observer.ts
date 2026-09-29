import { normalizeSubtitleText } from '../utils/normalizer';

export type CaptionChangeHandler = (text: string, currentTimeMs: number) => void;

export class PrimeObserver {
  private videoElement: HTMLVideoElement | null = null;
  private observer: MutationObserver | null = null;
  private pollInterval: number | null = null;
  private lastCapturedText: string = '';
  private handlers: CaptionChangeHandler[] = [];

  private readonly CAPTION_SELECTORS = [
    '.atvwebplayersdk-captions-text',
    '.atvwebplayersdk-captions-overlay',
    '.atvwebplayersdk-subtitle-text',
    "[class*='atvwebplayersdk-captions']",
    "[class*='atvwebplayersdk-subtitle']",
    "[class*='captions-text']",
    "[class*='captionsOverlay']",
    "[class*='subtitle-text']",
    "[class*='subtitles-text']",
    "[class*='timed-text']",
    '#fake-captions', // Local fake test page support
  ];

  start() {
    this.findAndBindVideo();
    this.setupMutationObserver();
    this.setupPolling();
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.pollInterval !== null) {
      window.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  onCaptionChange(handler: CaptionChangeHandler) {
    this.handlers.push(handler);
  }

  getVideo(): HTMLVideoElement | null {
    if (!this.videoElement || !this.videoElement.isConnected) {
      this.findAndBindVideo();
    }
    return this.videoElement;
  }

  getCurrentTimeMs(): number {
    const video = this.getVideo();
    if (video && typeof video.currentTime === 'number') {
      return Math.floor(video.currentTime * 1000);
    }
    return 0;
  }

  private findAndBindVideo() {
    const candidates = [
      document.querySelector('#dv-web-player video') as HTMLVideoElement,
      document.querySelector('.webPlayerContainer video') as HTMLVideoElement,
      document.querySelector('video') as HTMLVideoElement,
    ];

    for (const v of candidates) {
      if (v) {
        this.videoElement = v;
        break;
      }
    }
  }

  private cachedCaptionEl: HTMLElement | null = null;
  private rAFPending: boolean = false;

  private extractVisibleCaptionText(): string {
    // 1. Fast path: check cached element directly (0.002ms)
    if (this.cachedCaptionEl && this.cachedCaptionEl.isConnected) {
      const txt = (this.cachedCaptionEl.innerText || this.cachedCaptionEl.textContent || '').trim();
      return normalizeSubtitleText(txt);
    }

    // 2. Direct query for prime video captions
    const primeCaptionEl = document.querySelector(
      '.atvwebplayersdk-captions-text, .atvwebplayersdk-subtitle-text, #fake-captions'
    ) as HTMLElement;
    if (primeCaptionEl) {
      this.cachedCaptionEl = primeCaptionEl;
      const txt = (primeCaptionEl.innerText || primeCaptionEl.textContent || '').trim();
      return normalizeSubtitleText(txt);
    }

    // 3. Fallback scan across secondary selectors
    for (const selector of this.CAPTION_SELECTORS) {
      const found = document.querySelector(selector) as HTMLElement;
      if (found) {
        const txt = (found.innerText || found.textContent || '').trim();
        if (txt) {
          this.cachedCaptionEl = found;
          return normalizeSubtitleText(txt);
        }
      }
    }

    return '';
  }

  private checkCaptions() {
    const text = this.extractVisibleCaptionText();
    if (text !== this.lastCapturedText) {
      this.lastCapturedText = text;
      if (text) {
        console.log('[GermanTutor] Subtitle detected on Prime Video:', text);
      }
      const timeMs = this.getCurrentTimeMs();
      for (const handler of this.handlers) {
        try {
          handler(text, timeMs);
        } catch (err) {
          console.error('[GermanTutor] Error in caption handler:', err);
        }
      }
    }
  }

  private setupMutationObserver() {
    if (this.observer) {
      this.observer.disconnect();
    }

    // Debounce with requestAnimationFrame so high-FPS video rendering never lags the page
    this.observer = new MutationObserver(() => {
      if (this.rAFPending) return;
      this.rAFPending = true;
      requestAnimationFrame(() => {
        this.rAFPending = false;
        this.checkCaptions();
      });
    });

    const targetNode =
      document.querySelector('#dv-web-player') ||
      document.querySelector('.webPlayerContainer') ||
      document.body;

    if (targetNode) {
      this.observer.observe(targetNode, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  private setupPolling() {
    if (this.pollInterval !== null) {
      window.clearInterval(this.pollInterval);
    }

    // Lightweight 400ms background heartbeat (virtually 0% CPU)
    this.pollInterval = window.setInterval(() => {
      this.checkCaptions();
    }, 400);
  }
}

export const primeObserver = new PrimeObserver();
