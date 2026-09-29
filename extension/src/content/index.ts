import { DEFAULT_SETTINGS, SubtitleCue, TutorSettings } from '../types';
import { backendClient } from '../services/backend-client';
import { primeObserver } from '../services/prime-observer';
import { asbplayerAdapter } from '../services/asbplayer-adapter';
import { findCueByText } from '../utils/cue-matcher';
import { OverlayManager } from '../ui/overlay';
import { normalizeSubtitleText } from '../utils/normalizer';

class GermanStreamTutorContent {
  private settings: TutorSettings = { ...DEFAULT_SETTINGS };
  private overlayManager: OverlayManager;
  private currentSubtitleText: string = '';

  constructor() {
    this.overlayManager = new OverlayManager(this.settings);
    this.init();
  }

  private async init() {
    console.log('[GermanTutor] Initializing German Stream Tutor content script...');

    // 1. Load persisted settings
    await this.loadSettings();

    // 2. Setup settings listeners
    this.setupSettingsListeners();

    // 3. Connect overlay manager callback to save settings changes
    this.overlayManager.onSettingsChange((newSettings) => {
      this.updateSettings(newSettings);
    });

    // 4. Connect Asbplayer adapter
    asbplayerAdapter.onCuesUpdated((cues) => {
      console.log(`[GermanTutor] asbplayer cues updated: ${cues.length} cues loaded.`);
    });

    // 5. Connect Prime caption observer
    primeObserver.onCaptionChange((captionText, currentTimeMs) => {
      this.handleCaptionChange(captionText, currentTimeMs);
    });

    primeObserver.start();
    console.log('[GermanTutor] Watching for subtitles on', window.location.href);
  }

  private async loadSettings() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
        this.settings = { ...DEFAULT_SETTINGS, ...stored };
        this.overlayManager.updateSettings(this.settings);
        backendClient.setBackendUrl(this.settings.backendUrl);
      }
    } catch (e) {
      console.warn('[GermanTutor] Could not read chrome.storage, using defaults', e);
    }
  }

  private setupSettingsListeners() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local') {
            const updated: Partial<TutorSettings> = {};
            for (const key of Object.keys(changes)) {
              (updated as any)[key] = changes[key].newValue;
            }
            this.settings = { ...this.settings, ...updated };
            this.overlayManager.updateSettings(this.settings);
            if (updated.backendUrl) {
              backendClient.setBackendUrl(updated.backendUrl);
            }
          }
        });
      }

      // Also listen for runtime messages from popup
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
          if (message.type === 'GET_STATUS') {
            sendResponse({
              settings: this.settings,
              currentSubtitle: this.currentSubtitleText,
              hasVideo: Boolean(primeObserver.getVideo()),
            });
          } else if (message.type === 'UPDATE_SETTINGS') {
            this.updateSettings(message.settings);
            sendResponse({ ok: true });
          }
        });
      }
    } catch (e) {
      console.warn('[GermanTutor] Storage listener setup failed', e);
    }
  }

  private updateSettings(partial: Partial<TutorSettings>) {
    this.settings = { ...this.settings, ...partial };
    this.overlayManager.updateSettings(this.settings);
    if (partial.backendUrl) {
      backendClient.setBackendUrl(partial.backendUrl);
    }
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(this.settings);
      }
    } catch (e) {
      // Ignore
    }
  }

  private async handleCaptionChange(rawText: string, currentTimeMs: number) {
    const cleanText = normalizeSubtitleText(rawText);
    this.currentSubtitleText = cleanText;

    if (!cleanText) {
      this.overlayManager.hide();
      return;
    }

    if (!this.settings.enabled) {
      return;
    }

    // Attempt to match against known asbplayer cues for previous/next sentence context
    let previousText: string | undefined;
    let nextText: string | undefined;

    const cues = asbplayerAdapter.getCues();
    if (cues.length > 0) {
      const match = findCueByText(cleanText, cues);
      if (match) {
        previousText = match.previous?.text;
        nextText = match.next?.text;
      }
    }

    // Instant Local Analysis (<0.03s) - 100% zero lag, instant subtitle sync
    const instantAnalysis = await backendClient.analyzeSentence(cleanText, {
      previous: previousText,
      next: nextText,
      userLevel: this.settings.userLevel,
      threshold: this.settings.threshold,
      aiEnabled: false,
      backendUrl: this.settings.backendUrl,
    });

    // Display analysis immediately
    if (instantAnalysis && (this.currentSubtitleText === cleanText || !this.currentSubtitleText)) {
      this.overlayManager.showAnalysis(instantAnalysis);
    }
  }
}

// Start content script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new GermanStreamTutorContent());
} else {
  new GermanStreamTutorContent();
}
