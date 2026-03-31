/**
 * Módulo de encriptación de tokens — DESACTIVADO temporalmente.
 *
 * encrypt() y decrypt() operan como pass-through (no encriptan/desencriptan).
 * Si hay tokens con prefijo 'enc:' en la BD de un deploy anterior,
 * decrypt() los retorna tal cual (no intenta desencriptar).
 *
 * TODO: reactivar encriptación después de estabilizar el deploy.
 */

function encrypt(plaintext) {
  return plaintext;
}

function decrypt(stored) {
  return stored;
}

console.log('[crypto] Encriptación desactivada — tokens en texto plano');

module.exports = { encrypt, decrypt };
