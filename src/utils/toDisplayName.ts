/**
 * Title-style casing for workout/exercise names (e.g. LAT PULLDOWN → Lat Pulldown).
 * Word-split on whitespace; punctuation-only tokens are unchanged.
 */
export function toDisplayName(value: string): string {
  const t = value.trim();
  if (!t) return value;
  return t
    .split(/\s+/)
    .map((word) => {
      if (!/[a-zA-Z]/.test(word)) return word;
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}
