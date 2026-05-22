import { test } from 'node:test';
import assert from 'node:assert';
import { validatePublicHttpUrl, isValidPublicHttpUrl, relabelPublicHttpUrlError } from './url-validation.ts';

test('validatePublicHttpUrl validates correct URLs', () => {
  const result = validatePublicHttpUrl('https://example.com');
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.error, undefined);
});

test('validatePublicHttpUrl rejects empty input', () => {
  const result = validatePublicHttpUrl('   ');
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.error, 'Website URL is required.');
});

test('validatePublicHttpUrl rejects local addresses', () => {
  const result = validatePublicHttpUrl('http://localhost');
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.error, 'Website URL must point to a public website, not a local or internal address.');
});

test('validatePublicHttpUrl rejects private IPs', () => {
  const result = validatePublicHttpUrl('http://192.168.1.1');
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.error, 'Website URL must point to a public website, not a private network address.');
});

test('validatePublicHttpUrl rejects invalid formats', () => {
  const result = validatePublicHttpUrl('not-a-url');
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.error, 'Enter a valid website URL starting with http:// or https://.');
});

test('isValidPublicHttpUrl helper functions correctly', () => {
  assert.strictEqual(isValidPublicHttpUrl('https://google.com'), true);
  assert.strictEqual(isValidPublicHttpUrl('http://127.0.0.1'), false);
});

test('relabelPublicHttpUrlError works', () => {
  const err = 'Website URL is required.';
  assert.strictEqual(relabelPublicHttpUrlError(err, 'Input URL'), 'Input URL is required.');
});
