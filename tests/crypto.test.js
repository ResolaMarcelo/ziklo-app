const crypto = require('crypto');

// Set a test encryption key before importing the module
const TEST_KEY = crypto.randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = TEST_KEY;

const { encrypt, decrypt } = require('../src/lib/crypto');

describe('crypto encrypt/decrypt', () => {
  test('roundtrip: decrypt(encrypt(x)) === x', () => {
    const token = 'shpat_abc123_test_token_value';
    const encrypted = encrypt(token);
    expect(encrypted).not.toBe(token);
    expect(encrypted.startsWith('enc:')).toBe(true);
    expect(decrypt(encrypted)).toBe(token);
  });

  test('encrypted format is enc:<iv>:<tag>:<cipher>', () => {
    const encrypted = encrypt('test_value');
    const parts = encrypted.split(':');
    expect(parts[0]).toBe('enc');
    expect(parts).toHaveLength(4);
    // iv = 12 bytes = 24 hex chars
    expect(parts[1]).toHaveLength(24);
    // authTag = 16 bytes = 32 hex chars
    expect(parts[2]).toHaveLength(32);
    // ciphertext is non-empty
    expect(parts[3].length).toBeGreaterThan(0);
  });

  test('does not double-encrypt already encrypted values', () => {
    const token = 'shpat_test';
    const encrypted = encrypt(token);
    const doubleEncrypted = encrypt(encrypted);
    expect(doubleEncrypted).toBe(encrypted);
  });

  test('plaintext passthrough on decrypt (legacy tokens)', () => {
    const plaintext = 'shpat_legacy_token_no_prefix';
    expect(decrypt(plaintext)).toBe(plaintext);
  });

  test('handles null/undefined/empty gracefully', () => {
    expect(encrypt(null)).toBeNull();
    expect(encrypt(undefined)).toBeUndefined();
    expect(encrypt('')).toBe('');
    expect(decrypt(null)).toBeNull();
    expect(decrypt(undefined)).toBeUndefined();
    expect(decrypt('')).toBe('');
  });

  test('tampered ciphertext returns null', () => {
    const encrypted = encrypt('secret');
    // Flip a char in the ciphertext portion
    const tampered = encrypted.slice(0, -2) + 'ff';
    expect(decrypt(tampered)).toBeNull();
  });

  test('each encryption produces unique output (random IV)', () => {
    const token = 'same_value';
    const a = encrypt(token);
    const b = encrypt(token);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(token);
    expect(decrypt(b)).toBe(token);
  });
});
