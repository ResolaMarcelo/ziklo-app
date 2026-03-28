/**
 * Middleware de autenticación para el panel admin.
 *
 * Flujo Shopify OAuth:
 *   - Rutas públicas: GET /login, POST /api/login (legacy), GET /api/login-status
 *   - Si hay sesión válida (adminLoggedIn + shopDomain) → next()
 *   - Si no → redirige a /admin/login (o 401 para rutas /api/)
 *
 * req.session después de login:
 *   - adminLoggedIn: true
 *   - shopDomain:    "mi-tienda.myshopify.com"
 *   - shopId:        cuid del registro Shop en DB
 *   - shopName:      nombre de la tienda
 */
function adminAuth(req, res, next) {
  // Rutas públicas (relativas al mount point /admin)
  const isPublic =
    req.path === '/login' ||
    (req.path === '/api/login' && req.method === 'POST') ||
    req.path === '/api/login-status';

  if (isPublic) return next();

  // Sesión válida
  if (req.session && req.session.adminLoggedIn === true) {
    return next();
  }

  // Sin sesión → API devuelve 401, resto redirige al login
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autorizado', redirect: '/admin/login' });
  }

  return res.redirect('/admin/login');
}

module.exports = adminAuth;
