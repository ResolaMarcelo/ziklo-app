/**
 * Token encryption helpers — AES-256-GCM
 *
 * Tokens stored in the DB are prefixed with "enc:" so we can detect
 * whether a value is already encrypted (handles legacy plaintext rows).
 *
 * Format:  enc:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * Requires env var ENCRYPTION_KEY = 64-char hex string (32 bytes).
 * Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const PREFIX    = 'enc:';

function getKey() {
  const hex = process.env.ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    // In development without a key, skip encryption (log a warning once)
    return null;
  }
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    console.error('[crypto] ENCRYPTION_KEY must be 64 hex chars (32 bytes). Encryption disabled.');
    return null;
  }
  return buf;
}

// Warn once at startup if key is missing in production
let _warnedOnce = false;
function warnIfNeeded() {
  if (!_warnedOnce && !process.env.ENCRYPTION_KEY && !process.env.TOKEN_ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
    console.warn('[crypto] WARNING: ENCRYPTION_KEY is not set. Tokens are stored in plaintext!');
    _warnedOnce = true;
  }
}

/**
 * Encrypts a plaintext string.
 * Returns the original value unchanged if:
 *  - it's null/undefined/empty
 *  - it's already encrypted (starts with PREFIX)
 *  - ENCRYPTION_KEY is not set (graceful degradation)
 */
function encrypt(plaintext) {
  warnIfNeeded();
  if (plaintext == null || plaintext === '') return plaintext;
  if (String(plaintext).startsWith(PREFIX)) return plaintext; // already encrypted

  const key = getKey();
  if (!key) return plaintext; // no key → store plaintext (dev mode)

  const iv      = crypto.randomBytes(12);
  const cipher  = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc     = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${enc.toString('hex')}`;
}

/**
 * Decrypts a previously encrypted string.
 * Returns the original value unchanged if:
 *  - it's null/undefined/empty
 *  - it doesn't have the PREFIX (legacy plaintext — pass through)
 * Returns null if decryption fails (tampered/corrupt data).
 */
function decrypt(ciphertext) {
  if (ciphertext == null || ciphertext === '') return ciphertext;
  if (!String(ciphertext).startsWith(PREFIX)) {
    // Not encrypted (stored before encryption was added) — return as-is
    return ciphertext;
  }

  const key = getKey();
  if (!key) {
    // Can't decrypt without the key — return null rather than expose garbage
    console.error('[crypto] Cannot decrypt: ENCRYPTION_KEY is not set');
    return null;
  }

  try {
    const rest               = ciphertext.slice(PREFIX.length);
    const [ivHex, tagHex, encHex] = rest.split(':');
    if (!ivHex || !tagHex || !encHex) throw new Error('Invalid encrypted format');

    const iv       = Buffer.from(ivHex,  'hex');
    const authTag  = Buffer.from(tagHex, 'hex');
    const encBuf   = Buffer.from(encHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const plain = Buffer.concat([decipher.update(encBuf), decipher.final()]);
    return plain.toString('utf8');
  } catch (err) {
    console.error('[crypto] Decryption failed:', err.message);
    return null;
  }
}

module.exports = { encrypt, decrypt };
