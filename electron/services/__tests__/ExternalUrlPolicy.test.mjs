import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const policyPath = path.resolve(process.cwd(), 'dist-electron/electron/services/ExternalUrlPolicy.js');
const { CANONICAL_LEGAL_URLS, isAllowedExternalUrl, isCanonicalLegalUrl } =
  await import(pathToFileURL(policyPath).href);

test('canonical Terms and Privacy URLs are allowed exactly', () => {
  assert.equal(isCanonicalLegalUrl(CANONICAL_LEGAL_URLS.terms), true);
  assert.equal(isCanonicalLegalUrl(CANONICAL_LEGAL_URLS.privacy), true);
  assert.equal(isAllowedExternalUrl(CANONICAL_LEGAL_URLS.terms), true);
  assert.equal(isAllowedExternalUrl(CANONICAL_LEGAL_URLS.privacy), true);
});

test('lookalike, redirect, and unapproved external destinations remain blocked', () => {
  assert.equal(isAllowedExternalUrl('https://github.com/naheedroomy/InterviewOS/blob/main/PRIVACY.md?redirect=https://evil.example'), false);
  assert.equal(isAllowedExternalUrl('https://github.com/naheedroomy/OtherRepo/blob/main/PRIVACY.md'), false);
  assert.equal(isAllowedExternalUrl('http://github.com/naheedroomy/InterviewOS/blob/main/PRIVACY.md'), false);
  assert.equal(isAllowedExternalUrl('https://evil.example/'), false);
  assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false);
});
