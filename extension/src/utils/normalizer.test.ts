import { describe, it, expect } from 'vitest';
import { normalizeSubtitleText, canonicalTextForMatch, unescapeHtml } from './normalizer';

describe('normalizer', () => {
  it('unescapes HTML entities correctly', () => {
    expect(unescapeHtml('&quot;Hallo&quot; &amp; &lt;Tsch&uuml;ss&gt;')).toBe('"Hallo" & <Tschüss>');
  });

  it('strips formatting tags and collapses newlines', () => {
    const raw = '<font color="#fff">Du weißt doch</font><br><i>überhaupt nicht</i>,\nwovon du redest.';
    const result = normalizeSubtitleText(raw);
    expect(result).toBe('Du weißt doch überhaupt nicht, wovon du redest.');
  });

  it('removes dialogue dashes', () => {
    const raw = '- Naruto! - Was gibt es?';
    const result = normalizeSubtitleText(raw);
    expect(result).toBe('Naruto! - Was gibt es?');
  });

  it('creates clean canonical text for matching', () => {
    const raw1 = '„Du weißt doch überhaupt nicht, wovon du redest!“';
    const raw2 = '  Du weißt doch überhaupt nicht, wovon du redest.  ';
    expect(canonicalTextForMatch(raw1)).toBe('du weißt doch überhaupt nicht, wovon du redest');
    expect(canonicalTextForMatch(raw1)).toBe(canonicalTextForMatch(raw2));
  });
});
