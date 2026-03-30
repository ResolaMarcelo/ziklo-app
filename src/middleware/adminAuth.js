/**
 * Middleware de autenticación para el panel admin.
 *
 * Rutas públicas (sin auth):
 *   GET  /login
 *   POST /api/login        (login legacy por env vars — se mantiene por compatibilidad)
 *   GET  /api/login-status
 *
 * Sesión válida si:
 *   - req.session.adminLoggedIn === true  (setteado por email/pass, Google OAuth o login legacy)
 */
function adminAuth(req, res, next) {
  const isPublic =
    req.path === '/login' ||
    (req.path === '/api/login' && req.method === 'POST') ||
    req.path === '/api/login-status';

  if (isPublic) return next();

  if (req.session && req.session.adminLoggedIn === true) {
    return next();
  }

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autorizado', redirect: '/admin/login' });
  }

  return res.redirect('/admin/login');
}

module.exports = adminAuth;
