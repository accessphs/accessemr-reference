// Small string helpers that reproduce the Ruby / Rails behaviour the AccessEMR engine relies on.

// Rails [[:space:]] (Unicode White_Space).
const SPACE_CLASS = '\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const SPACES = new RegExp(`[${SPACE_CLASS}]+`, 'g');
const BLANK = new RegExp(`^[${SPACE_CLASS}]*$`);

// Approximation of Ruby's Unicode-aware [[:alpha:]] for Latin, Greek and Cyrillic scripts (no \p{} escapes, so
// the regexes also run on older JavaScript engines such as Hermes builds without Unicode property support).
export const ALPHA = 'A-Za-z\\u00aa\\u00b5\\u00ba\\u00c0-\\u00d6\\u00d8-\\u00f6\\u00f8-\\u02af\\u0370-\\u03ff\\u0400-\\u052f';

/** Rails String#squish: collapse runs of whitespace to one space and trim. */
export function squish(text: string): string {
  return text.replace(SPACES, ' ').replace(/^ | $/g, '');
}

/** Ruby String#strip (ASCII whitespace and NUL). */
export function strip(text: string): string {
  return text.replace(/^[\t\n\v\f\r \0]+/, '').replace(/[\t\n\v\f\r \0]+$/, '');
}

/** Rails blank? for a value that may be null/undefined. */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === 'string') return BLANK.test(value);
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Ruby to_s for the values we read from JSON. */
export function toS(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Rails String#humanize for simple snake_case words ("onc_list" → "Onc list"). */
export function humanize(text: string): string {
  const words = text.replace(/^_+/, '').replace(/_id$/, '').replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Array#uniq keeping the first occurrence. */
export function uniq<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}
