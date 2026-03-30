const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fetch = require('node-fetch');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SCOPES = 'read_customers,write_customers,read_orders,write_orders,read_products';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Verifica que el HMAC que envía Shopify en el callback sea válido.
 * Previene que alguien forje una URL de callback falsa.
 */
function verificarHMAC(query) {
  const { hmac, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest)
    .sort()
    .map(k => `${k}=${rest[k]}`)
    .join('&');
  const computed = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(message)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmac));
}

/**
 * Normaliza el dominio de la tienda.
 * "mi-tienda" → "mi-tienda.myshopify.com"
 * "https://mi-tienda.myshopify.com/" → "mi-tienda.myshopify.com"
 */
function normalizarDominio(input) {
  if (!input) return null;
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!d.includes('.')) d = `${d}.myshopify.com`;
  if (!d.endsWith('.myshopify.com')) d = `${d}.myshopify.com`;
  return d;
}

// ── State firmado (no depende de sesión para soportar cross-site redirect) ──
function crearState(shop) {
  const payload = Buffer.from(JSON.stringify({ shop, ts: Date.now() })).toString('base64url');
  const sig     = crypto.createHmac('sha256', CLIENT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verificarState(state, shop) {
  if (!state) return false;
  const dot = state.lastIndexOf('.');
  if (dot < 0) return false;
  const payload = state.slice(0, dot);
  const sig     = state.slice(dot + 1);
  const expected = crypto.createHmac('sha256', CLIENT_SECRET).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.shop !== shop) return false;           // shop no coincide
    if (Date.now() - data.ts > 10 * 60 * 1000) return false; // expiró (10 min)
    return true;
  } catch { return false; }
}

// ── Iniciar OAuth ──────────────────────────────────────────────────────────

// GET /auth?shop=mi-tienda.myshopify.com
router.get('/', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send(
      'Faltan SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET en las variables de entorno.'
    );
  }

  const shop = normalizarDominio(req.query.shop);
  if (!shop) return res.redirect('/admin/?error=missing_shop');

  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
    return res.redirect('/admin/?error=invalid_shop');
  }

  const redirectUri = `${process.env.APP_URL}/auth/callback`;
  const state       = crearState(shop);

  // Guardar userId en sesión por si no estaba (para vincularlo al volver)
  // No guardamos nonce — el state firmado es suficiente
  req.session.oauthShop = shop;

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  res.redirect(authUrl);
});

// ── Callback OAuth ─────────────────────────────────────────────────────────

// GET /auth/callback — Shopify redirige acá con el código
router.get('/callback', async (req, res) => {
  const { shop, code, state, hmac } = req.query;

  // 1. Verificar HMAC (autenticidad del request)
  if (!verificarHMAC(req.query)) {
    return res.redirect('/admin/?error=invalid_hmac');
  }

  // 2. Verificar state firmado (no depende de sesión)
  if (!verificarState(state, shop)) {
    return res.redirect('/admin/?error=invalid_state');
  }

  if (!shop || !code) {
    return res.redirect('/admin/?error=missing_params');
  }

  try {
    // 3. Intercambiar el código por el access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error('Error obteniendo access token:', tokenData);
      return res.redirect('/admin/login?error=token_failed');
    }

    // 4. Obtener info de la tienda
    const shopRes = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });
    const shopData = await shopRes.json();
    const shopInfo = shopData.shop || {};

    // 5. Guardar / actualizar la tienda en la DB
    const savedShop = await prisma.shop.upsert({
      where: { domain: shop },
      update: {
        accessToken,
        shopName: shopInfo.name || shop,
        email: shopInfo.email || null,
      },
      create: {
        domain: shop,
        accessToken,
        shopName: shopInfo.name || shop,
        email: shopInfo.email || null,
      },
    });

    // 6. Si hay un usuario logueado, vincularlo a esta tienda
    let linkUserId = req.session.userId || null;

    // Fallback: si no hay userId en sesión pero sí email, buscarlo en la DB
    if (!linkUserId && req.session.userEmail) {
      const foundUser = await prisma.user.findUnique({
        where: { email: req.session.userEmail },
      });
      if (foundUser) {
        linkUserId = foundUser.id;
        req.session.userId   = foundUser.id;
        req.session.userRole = foundUser.role;
      }
    }

    if (linkUserId) {
      await prisma.userShop.upsert({
        where:  { userId_shopDomain: { userId: linkUserId, shopDomain: shop } },
        update: {},
        create: { userId: linkUserId, shopDomain: shop },
      });
    }

    // 7. Crear sesión de admin
    req.session.oauthNonce = null;
    req.session.oauthShop = null;
    req.session.adminLoggedIn = true;
    req.session.shopDomain = shop;
    req.session.shopId = savedShop.id;
    req.session.shopName = savedShop.shopName;

    console.log(`✅ Shop autenticado: ${shop} (${savedShop.shopName})`);

    // 7. Redirigir al panel admin
    res.redirect('/admin/');

  } catch (err) {
    console.error('Error en OAuth callback:', err);
    res.redirect('/admin/login?error=server_error');
  }
});

// ── Logout ─────────────────────────────────────────────────────────────────

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

module.exports = router;
