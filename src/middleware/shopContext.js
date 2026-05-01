const prisma = require('../lib/prisma');

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
 *   1. req.session.clienteShop → portal /cliente autenticado (confiable)
 *   2. req.query.shop          → widget que pasa ?shop= en la URL
 *   3. req.body.shopDomain     → peticiones POST del widget/checkout
 *
 *   En rutas públicas el dominio se valida (debe ser *.myshopify.com) y
 *   los tokens sensibles se eliminan de req.shop para no exponer credenciales
 *   si un atacante envía un shopDomain arbitrario.
 */

const MYSHOPIFY_RE = /^[a-z0-9][a-z0-9\-]*\.myshopify\.com$/;
const TIENDANUBE_RE = /^[a-z0-9][a-z0-9\-]*\.(mitiendanube\.com|nuvemshop\.com\.br)$/;

function sanitizeDomain(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const d = raw.trim().toLowerCase();
  if (MYSHOPIFY_RE.test(d)) return d;
  if (TIENDANUBE_RE.test(d)) return d;
  return null;
}

/** Elimina tokens sensibles de un shop record para uso en rutas públicas */
function stripSensitiveFields(shop) {
  if (!shop) return shop;
  const safe = { ...shop };
  delete safe.accessToken;
  delete safe.klaviyoAccessToken;
  delete safe.klaviyoRefreshToken;
  delete safe.klaviyoTokenExpiry;
  return safe;
}

module.exports = async function shopContext(req, res, next) {
  req.shop = null;

  let domain = null;
  let isAdmin = false;

  if (req.session?.adminLoggedIn) {
    // ── Rutas de admin: fuente de verdad = sesión únicamente ──────────────
    isAdmin = true;
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
    // clienteShop viene de la sesión (seteado al autenticar) — confiable
    // query.shop y body.shopDomain vienen del cliente — validar formato
    domain =
      req.session?.clienteShop              ||
      sanitizeDomain(req.query?.shop)       ||
      sanitizeDomain(req.body?.shopDomain)  ||
      null;
  }

  // Fallback para Tiendanube: resolver por storeId si no hay domain
  const tiendanubeStoreId = !domain && !isAdmin ? (req.query?.storeId || req.body?.storeId || null) : null;

  if (!domain && !tiendanubeStoreId) return next();

  try {
    let shop;
    if (domain) {
      shop = await prisma.shop.findUnique({ where: { domain } });
    } else if (tiendanubeStoreId) {
      shop = await prisma.shop.findFirst({ where: { tiendanubeStoreId: String(tiendanubeStoreId) } });
    }
    // En rutas públicas, eliminar tokens sensibles del objeto shop
    req.shop = isAdmin ? shop : stripSensitiveFields(shop);
  } catch (err) {
    console.error('shopContext error:', err.message);
  }

  next();
};
