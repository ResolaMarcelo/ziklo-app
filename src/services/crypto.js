/**
 * Encriptación AES-256-GCM para tokens sensibles (accessToken, mpAccessToken).
 *
 * Usa la variable de entorno TOKEN_ENCRYPTION_KEY (hex, 64 chars = 32 bytes).
 * Si no está configurada, opera en modo transparente (sin encriptar) para
 * compatibilidad con tokens existentes en la BD.
 */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const KEY_HEX = process.env.TOKEN_ENCRYPTION_KEY; // 64 hex chars = 32 bytes
const PREFIX = 'enc:';                             // marca tokens encriptados

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
