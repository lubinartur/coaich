/**
 * Human-readable progression copy for UI only (Today / Logger).
 * Does not change progression engine output — maps strings at display time.
 */
function mapProgressionStatusString(raw: string): string {
  const s = raw.trim();
  if (s === 'Establishing baseline' || s === 'Baseline') return '';
  if (s === '↑ Reps' || s.includes('+1 rep')) return 'Add 1 rep';
  if (s === '↑ Weight' || s === '↑ Weight increase' || /^↑\s*Weight/i.test(s)) return 'Increase weight';
  if (s === 'Holding — consolidating volume' || s === 'Holding') return 'Maintain';
  if (/deload/i.test(s)) return 'Deload';
  return s;
}

/**
 * Prefer detail (presentation) text, then short inline — first non-empty mapped result wins.
 */
export function progressionStatusDisplayText(
  shortOrInline: string | null | undefined,
  detailText: string | null | undefined,
): string {
  const candidates = [detailText, shortOrInline];
  for (const raw of candidates) {
    if (raw == null || raw.trim() === '') continue;
    const mapped = mapProgressionStatusString(raw);
    if (mapped !== '') return mapped;
  }
  return '';
}
