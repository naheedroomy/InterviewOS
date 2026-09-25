export const CANONICAL_LEGAL_URLS = {
  terms: 'https://github.com/naheedroomy/InterviewOS/blob/main/termsandcondition.md',
  privacy: 'https://github.com/naheedroomy/InterviewOS/blob/main/PRIVACY.md',
} as const;

const ALLOWED_WEB_URLS = new Set([
  'https://mail.google.com/mail/',
  CANONICAL_LEGAL_URLS.terms,
  CANONICAL_LEGAL_URLS.privacy,
]);

/**
 * Returns true only for exact, approved HTTPS destinations. The renderer can
 * request a link, but it cannot choose an arbitrary external origin.
 */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && ALLOWED_WEB_URLS.has(parsed.href)) return true;
    return parsed.protocol === 'x-apple.systempreferences:' && process.platform === 'darwin';
  } catch {
    return false;
  }
}

export function isCanonicalLegalUrl(url: string): boolean {
  return url === CANONICAL_LEGAL_URLS.terms || url === CANONICAL_LEGAL_URLS.privacy;
}
