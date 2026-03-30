/**
 * clienteAuth — middleware para rutas del portal /cliente
 *
 * Permite el acceso si:
 *   a) La sesión de admin está activa (adminLoggedIn: true) — bypass completo
 *   b) La sesión de cliente está activa y no expiró (clienteEmail + clienteExpiry)
 *
 * En caso contrario devuelve 401.
 * Adjunta req.clienteEmail y req.clienteShop para uso en los handlers.
 */
module.exports = function clienteAuth(req, res, next) {
  // Admin bypass — el panel usa estas rutas también
  if (req.session?.adminLoggedIn) return next();

  const email  = req.session?.clienteEmail;
  const shop   = req.session?.clienteShop;
  const expiry = req.session?.clienteExpiry || 0;

  if (email && shop && Date.now() < expiry) {
    req.clienteEmail = email;
    req.clienteShop  = shop;
    return next();
  }

  return res.status(401).json({ error: 'Sesión expirada. Ingresá tu email nuevamente.', code: 'CLIENTE_UNAUTH' });
};
