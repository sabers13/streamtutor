/**
 * Subtitle text normalizer for clean matching and deduplication.
 */

const HTML_ENTITY_MAP: Record<string, string> = {
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&auml;': 'ä',
  '&ouml;': 'ö',
  '&uuml;': 'ü',
  '&szlig;': 'ß',
  '&Auml;': 'Ä',
  '&Ouml;': 'Ö',
  '&Uuml;': 'Ü',
};

export function unescapeHtml(text: string): string {
  if (!text) return '';
  return text.replace(/&(?:[a-zA-Z]+|#\d+|#x[a-fA-F0-9]+);/g, (match) => {
    if (HTML_ENTITY_MAP[match]) return HTML_ENTITY_MAP[match];
    if (match.startsWith('&#x')) {
      const hex = match.slice(3, -1);
      return String.fromCharCode(parseInt(hex, 16));
    }
    if (match.startsWith('&#' )) {
      const dec = match.slice(2, -1);
      return String.fromCharCode(parseInt(dec, 10));
    }
    return match;
  });
}

export function normalizeSubtitleText(raw: string): string {
  if (!raw) return '';

  // 1. Unescape HTML entities
  const unescaped = unescapeHtml(raw);

  // 2. Strip HTML/XML tags (<br>, <font ...>, <i>, etc.)
  const noTags = unescaped.replace(/<[^>]+>/g, ' ');

  // 3. Replace carriage returns and newlines with spaces
  const singleLine = noTags.replace(/[\r\n]+/g, ' ');

  // 4. Strip leading dialogue dashes (- Hallo -> Hallo)
  const noDash = singleLine.replace(/^[-–—]\s*/, '');

  // 5. Clean up any accidental space before punctuation
  const cleanPunctuation = noDash.replace(/\s+([,.:;!?])/g, '$1');

  // 6. Collapse multiple whitespaces and trim
  return cleanPunctuation.replace(/\s+/g, ' ').trim();
}

export function canonicalTextForMatch(text: string): string {
  const norm = normalizeSubtitleText(text).toLowerCase();
  // Strip quotes and edge punctuation for robust fuzzy matching
  return norm.replace(/^[„“"«»'…\-—\s]+|[„“"«»'…!?:;.,\s]+$/g, '').trim();
}
