/**
 * Middleware de autenticación para el panel admin.
 * Rutas públicas: GET /login, POST /api/login
 * Todo lo demás requiere sesión activa.
 * Nota: req.path es relativo al mount point /admin
 */
function adminAuth(req, res, next) {
  // Rutas públicas (relativas a /admin)
  const isPublic =
    req.path === '/login' ||
    (req.path === '/api/login' && req.method === 'POST');

  if (isPublic) return next();

  // Verificar sesión
  if (req.session && req.session.adminLoggedIn === true) {
    return next();
  }

  // Sin sesión → API responde 401, resto redirige al login
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  return res.redirect('/admin/login');
}

module.exports = adminAuth;
