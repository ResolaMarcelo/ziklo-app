/**
 * Protección CSRF basada en Origin/Referer para rutas admin.
 *
 * Valida que los requests mutantes (POST/PUT/DELETE) vengan de nuestro
 * propio dominio. Bloquea ataques donde un sitio externo envía un form
 * al backend con las cookies del admin.
 */

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Extraer solo protocol + host (sin trailing slash ni path)
function getOrigin(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

const allowedOrigin = getOrigin(APP_URL);

module.exports = function csrfProtection(req, res, next) {
  // Solo verificar métodos que mutan estado
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const origin  = req.headers['origin'];
  const referer = req.headers['referer'];

  // Verificar Origin primero, luego Referer como fallback
  const source = origin || (referer ? getOrigin(referer) : null);

  if (!source) {
    // Sin Origin ni Referer → rechazar (los browsers modernos siempre envían Origin en POST)
    console.warn(`[CSRF] Bloqueado: ${req.method} ${req.path} — sin Origin ni Referer`);
    return res.status(403).json({ error: 'Forbidden: missing origin' });
  }

  if (source !== allowedOrigin) {
    console.warn(`[CSRF] Bloqueado: ${req.method} ${req.path} — origin ${source} ≠ ${allowedOrigin}`);
    return res.status(403).json({ error: 'Forbidden: invalid origin' });
  }

  next();
};
