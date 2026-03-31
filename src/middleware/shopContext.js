const prisma = require('../lib/prisma');
const { decrypt } = require('../services/crypto');

/**
 * Middleware que adjunta req.shop con el registro completo de la tienda.
 *
 * Para rutas de admin (adminLoggedIn=true):
 *   Solo se acepta req.session.shopDomain (seteado en OAuth o login).
 *   Si hay userId pero no shopDomain, lo resuelve desde UserShop en DB.
 *   NUNCA se acepta shop desde body ni query — evita que un merchant
 *   manipule el contexto para acceder a datos de otra tienda.
 *
 * Para rutas públicas (widget, portal /cliente):
 *   1. req.session.clienteShop → portal /cliente autenticado
 *   2. req.query.shop          → widget que pasa ?shop= en la URL
 *   3. req.body.shopDomain     → peticiones POST del widget/checkout
 */
module.exports = async function shopContext(req, res, next) {
  req.shop = null;

  let domain = null;

  if (req.session?.adminLoggedIn) {
    // ── Rutas de admin: fuente de verdad = sesión únicamente ──────────────
    domain = req.session.shopDomain || null;

    // Fallback: si el userId está en sesión pero shopDomain no fue seteado
    // (ej: primera visita tras registro, antes de conectar Shopify)
    if (!domain && req.session.userId) {
      try {
        const userShop = await prisma.userShop.findFirst({
          where:   { userId: req.session.userId },
          orderBy: { createdAt: 'desc' },
        });
        if (userShop) {
          domain = userShop.shopDomain;
          // Persistir en sesión para no hacer DB en cada request
          req.session.shopDomain = domain;
        }
      } catch (err) {
        console.error('shopContext UserShop fallback error:', err.message);
      }
    }
  } else {
    // ── Rutas públicas: widget, portal cliente, checkout ──────────────────
    domain =
      req.session?.clienteShop ||
      req.query?.shop          ||
      req.body?.shopDomain     ||
      null;
  }

  if (!domain) return next();

  try {
    const shopRaw = await prisma.shop.findUnique({ where: { domain } });
    req.shop = shopRaw ? {
      ...shopRaw,
      accessToken:   decrypt(shopRaw.accessToken),
      mpAccessToken: decrypt(shopRaw.mpAccessToken),
    } : null;
  } catch (err) {
    console.error('shopContext error:', err.message);
  }

  next();
};
