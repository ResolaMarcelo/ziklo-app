const prisma = require('../lib/prisma');

/**
 * Middleware que adjunta req.shop con el registro completo de la tienda.
 *
 * Fuentes de shopDomain (en orden de prioridad):
 *  1. req.session.shopDomain  → login OAuth o login con password (lee env var)
 *  2. req.query.shop          → widget público que pasa ?shop= en la URL
 *  3. req.body.shopDomain     → peticiones POST del widget
 *
 * Si no se puede resolver, req.shop queda null y la ruta decide cómo manejarlo.
 */
module.exports = async function shopContext(req, res, next) {
  req.shop = null;

  const domain =
    req.session?.shopDomain  ||
    req.session?.clienteShop ||   // portal /cliente — sesión de cliente autenticado
    req.query?.shop          ||
    req.body?.shopDomain     ||
    null;

  if (!domain) return next();

  try {
    req.shop = await prisma.shop.findUnique({ where: { domain } });
  } catch (err) {
    console.error('shopContext error:', err.message);
  }

  next();
};
