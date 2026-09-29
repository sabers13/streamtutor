import { describe, it, expect } from 'vitest';
import { findCueByText, findCueByTimestamp } from './cue-matcher';
import { SubtitleCue } from '../types';

describe('cue-matcher', () => {
  const cues: SubtitleCue[] = [
    { text: 'Das ist mein Ninja-Weg!', start: 1000, end: 2500, track: 0 },
    { text: 'Du weißt doch überhaupt nicht, wovon du redest.', start: 3000, end: 6000, track: 0 },
    { text: 'Obwohl ich schwach bin, gebe ich niemals auf.', start: 7000, end: 9500, track: 0 },
  ];

  it('matches cue exactly by normalized text', () => {
    const match = findCueByText('Du weißt doch überhaupt nicht, wovon du redest.', cues);
    expect(match).not.toBeNull();
    expect(match?.index).toBe(1);
    expect(match?.previous?.text).toBe('Das ist mein Ninja-Weg!');
    expect(match?.next?.text).toBe('Obwohl ich schwach bin, gebe ich niemals auf.');
  });

  it('matches cue with quotation marks or minor punctuation differences', () => {
    const match = findCueByText('„Du weißt doch überhaupt nicht, wovon du redest!“', cues);
    expect(match).not.toBeNull();
    expect(match?.index).toBe(1);
  });

  it('matches cue by timestamp', () => {
    const match = findCueByTimestamp(4500, cues);
    expect(match).not.toBeNull();
    expect(match?.cue.text).toBe('Du weißt doch überhaupt nicht, wovon du redest.');
    expect(match?.index).toBe(1);
  });

  it('returns null when timestamp is between cues or text not found', () => {
    expect(findCueByTimestamp(2700, cues)).toBeNull();
    expect(findCueByText('Unbekannter Text', cues)).toBeNull();
  });
});
