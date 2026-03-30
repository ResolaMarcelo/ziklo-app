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

// ── Iniciar OAuth ──────────────────────────────────────────────────────────

// GET /auth?shop=mi-tienda.myshopify.com
// Redirige a Shopify para pedir autorización
router.get('/', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send(
      'Faltan SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET en las variables de entorno.'
    );
  }

  const shop = normalizarDominio(req.query.shop);
  if (!shop) {
    return res.redirect('/admin/login?error=missing_shop');
  }

  // Validar formato de dominio
  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
    return res.redirect('/admin/login?error=invalid_shop');
  }

  const redirectUri = `${process.env.APP_URL}/auth/callback`;
  const nonce = crypto.randomBytes(16).toString('hex');

  // Guardamos el nonce en la sesión para verificarlo en el callback
  req.session.oauthNonce = nonce;
  req.session.oauthShop = shop;

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${nonce}`;

  res.redirect(authUrl);
});

// ── Callback OAuth ─────────────────────────────────────────────────────────

// GET /auth/callback — Shopify redirige acá con el código
router.get('/callback', async (req, res) => {
  const { shop, code, state, hmac } = req.query;

  // 1. Verificar HMAC (autenticidad del request)
  if (!verificarHMAC(req.query)) {
    return res.redirect('/admin/login?error=invalid_hmac');
  }

  // 2. Verificar nonce (previene CSRF)
  if (state !== req.session.oauthNonce) {
    return res.redirect('/admin/login?error=invalid_state');
  }

  if (!shop || !code) {
    return res.redirect('/admin/login?error=missing_params');
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
    if (req.session.userId) {
      await prisma.userShop.upsert({
        where:  { userId_shopDomain: { userId: req.session.userId, shopDomain: shop } },
        update: {},
        create: { userId: req.session.userId, shopDomain: shop },
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
