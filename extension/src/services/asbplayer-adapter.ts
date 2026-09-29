import { SubtitleCue } from '../types';

export interface AsbplayerTrack {
  id: string;
  label?: string;
  language: string;
  url?: string;
  extension?: string;
}

export interface AsbplayerSyncedData {
  basename?: string;
  subtitles?: AsbplayerTrack[];
  error?: string;
}

export class AsbplayerAdapter {
  private bound: boolean = false;
  private currentCues: SubtitleCue[] = [];
  private onCuesUpdatedCallbacks: ((cues: SubtitleCue[]) => void)[] = [];

  constructor() {
    this.init();
  }

  init() {
    if (this.bound) return;
    this.bound = true;

    // Listen for asbplayer synced data event on document
    document.addEventListener('asbplayer-synced-data', (event: Event) => {
      const detail = (event as CustomEvent).detail as AsbplayerSyncedData;
      if (!detail) return;

      console.log('[GermanTutor] Received asbplayer-synced-data:', detail);

      const tracks = detail.subtitles || [];
      // Look for German track (e.g., 'de', 'ger', 'german', 'de-de')
      const germanTrack = tracks.find(
        (t) =>
          t.language.toLowerCase().startsWith('de') ||
          (t.label && t.label.toLowerCase().includes('deutsch')) ||
          (t.label && t.label.toLowerCase().includes('german'))
      );

      if (germanTrack && germanTrack.url) {
        console.log('[GermanTutor] Detected German subtitle track from asbplayer:', germanTrack);
      }
    });

    // Also check if we can query asbplayer for current subtitles via window or DOM
    this.requestAsbplayerData();
  }

  requestAsbplayerData() {
    try {
      document.dispatchEvent(new CustomEvent('asbplayer-get-synced-data'));
    } catch (e) {
      // Ignore
    }
  }

  setCues(cues: SubtitleCue[]) {
    this.currentCues = cues;
    this.onCuesUpdatedCallbacks.forEach((cb) => cb(cues));
  }

  getCues(): SubtitleCue[] {
    return this.currentCues;
  }

  onCuesUpdated(callback: (cues: SubtitleCue[]) => void) {
    this.onCuesUpdatedCallbacks.push(callback);
  }
}

export const asbplayerAdapter = new AsbplayerAdapter();
