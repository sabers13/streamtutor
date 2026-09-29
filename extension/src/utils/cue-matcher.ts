import { SubtitleCue } from '../types';
import { canonicalTextForMatch, normalizeSubtitleText } from './normalizer';

export interface MatchResult {
  cue: SubtitleCue;
  index: number;
  previous?: SubtitleCue;
  next?: SubtitleCue;
}

/**
 * Matches visible caption text against loaded subtitle cues.
 */
export function findCueByText(visibleText: string, cues: SubtitleCue[]): MatchResult | null {
  if (!visibleText || !cues || cues.length === 0) return null;

  const targetNorm = normalizeSubtitleText(visibleText);
  const targetCanonical = canonicalTextForMatch(visibleText);
  if (!targetCanonical) return null;

  // 1. Exact canonical match
  for (let i = 0; i < cues.length; i++) {
    const cueCanonical = canonicalTextForMatch(cues[i].text);
    if (cueCanonical === targetCanonical) {
      return {
        cue: cues[i],
        index: i,
        previous: i > 0 ? cues[i - 1] : undefined,
        next: i < cues.length - 1 ? cues[i + 1] : undefined,
      };
    }
  }

  // 2. Substring / Containment match (handles partial sentence splits or joins)
  for (let i = 0; i < cues.length; i++) {
    const cueCanonical = canonicalTextForMatch(cues[i].text);
    if (
      cueCanonical.length > 5 &&
      (targetCanonical.includes(cueCanonical) || cueCanonical.includes(targetCanonical))
    ) {
      return {
        cue: cues[i],
        index: i,
        previous: i > 0 ? cues[i - 1] : undefined,
        next: i < cues.length - 1 ? cues[i + 1] : undefined,
      };
    }
  }

  return null;
}

/**
 * Matches video current playback time in milliseconds against cue start/end times.
 */
export function findCueByTimestamp(currentTimeMs: number, cues: SubtitleCue[]): MatchResult | null {
  if (typeof currentTimeMs !== 'number' || isNaN(currentTimeMs) || !cues || cues.length === 0) {
    return null;
  }

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (
      typeof cue.start === 'number' &&
      typeof cue.end === 'number' &&
      currentTimeMs >= cue.start &&
      currentTimeMs <= cue.end
    ) {
      return {
        cue,
        index: i,
        previous: i > 0 ? cues[i - 1] : undefined,
        next: i < cues.length - 1 ? cues[i + 1] : undefined,
      };
    }
  }

  return null;
}
