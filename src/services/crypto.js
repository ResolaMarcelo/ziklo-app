/**
 * Encriptación AES-256-GCM para tokens sensibles (accessToken, mpAccessToken).
 *
 * Usa la variable de entorno TOKEN_ENCRYPTION_KEY (hex, 64 chars = 32 bytes).
 * Si no está configurada, opera en modo transparente (sin encriptar) para
 * compatibilidad con tokens existentes en la BD.
 */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const KEY_HEX = (process.env.TOKEN_ENCRYPTION_KEY || '').trim(); // 64 hex chars = 32 bytes
const PREFIX = 'enc:';                             // marca tokens encriptados

// Diagnóstico al arranque + self-test
if (KEY_HEX && KEY_HEX.length === 64) {
  console.log('[crypto] ✅ TOKEN_ENCRYPTION_KEY configurada (64 chars)');
  // Self-test: verificar que encrypt/decrypt roundtrip funciona
  try {
    const testVal = 'shpca_test_selfcheck_' + Date.now();
    const enc = encrypt(testVal);
    const dec = decrypt(enc);
    if (dec === testVal) {
      console.log('[crypto] ✅ Self-test passed — encrypt/decrypt roundtrip OK');
    } else {
      console.error('[crypto] ❌ Self-test FAILED — decrypt devolvió:', dec?.substring(0, 20));
    }
  } catch (e) {
    console.error('[crypto] ❌ Self-test CRASHED:', e.message);
  }
} else if (KEY_HEX) {
  console.warn(`[crypto] ⚠ TOKEN_ENCRYPTION_KEY tiene ${KEY_HEX.length} chars (esperado: 64) — encriptación desactivada`);
} else {
  console.warn('[crypto] ⚠ TOKEN_ENCRYPTION_KEY no configurada — tokens sin encriptar');
}

function getKey() {
  if (!KEY_HEX || KEY_HEX.length !== 64) return null;
  return Buffer.from(KEY_HEX, 'hex');
}

/**
 * Encripta un valor. Retorna `enc:<iv>:<authTag>:<ciphertext>` (todo en hex).
 * Si no hay key configurada, retorna el valor sin cambios.
 */
function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Desencripta un valor. Si no tiene el prefijo `enc:`, lo retorna tal cual
 * (compatibilidad con tokens viejos en texto plano).
 */
function decrypt(stored) {
  if (!stored) return stored;
  if (!stored.startsWith(PREFIX)) return stored; // token legacy, sin encriptar

  const key = getKey();
  if (!key) {
    console.warn('[crypto] TOKEN_ENCRYPTION_KEY no configurada, no se puede desencriptar');
    return stored;
  }

  try {
    const parts = stored.slice(PREFIX.length).split(':');
    if (parts.length !== 3) return stored;

    const [ivHex, authTagHex, ciphertext] = parts;
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.error('[crypto] Decryption failed:', err.message);
    return null; // token irrecuperable — forzar reconexión
  }
}

module.exports = { encrypt, decrypt };
